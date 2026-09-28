package dev.jevbridge.diagnostic

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {
    @OptIn(ExperimentalComposeUiApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                // Exposes each testTag as the view's resource-id, so UI Automator dumps can select it.
                Surface(Modifier.fillMaxSize().semantics { testTagsAsResourceId = true }) {
                    DiagnosticApp()
                }
            }
        }
    }
}

@Composable
private fun DiagnosticApp() {
    var checkout by remember { mutableStateOf(CheckoutModel()) }
    var confirmed by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        if (confirmed) Confirmation(checkout) else ChooseItems(checkout, onChange = { checkout = it }, onComplete = { confirmed = true })
    }
}

@Composable
private fun ChooseItems(checkout: CheckoutModel, onChange: (CheckoutModel) -> Unit, onComplete: () -> Unit) {
    Text("Sample Shop", style = MaterialTheme.typography.titleMedium)
    Text("Choose two items", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
    val summary = checkout.selectedItems.takeIf { it.isNotEmpty() }?.joinToString(", ") { it.title } ?: "None"
    Text("Selected: $summary", Modifier.testTag("selection.summary"))
    for (item in SampleItem.entries) {
        val chosen = item in checkout.selectedItems
        Button(
            onClick = { onChange(checkout.add(item)) },
            enabled = !chosen,
            modifier = Modifier.fillMaxWidth().testTag("choose.${item.name.lowercase()}"),
        ) {
            Row(Modifier.fillMaxWidth()) {
                Text("Add ${item.title} ($${item.priceCents / 100})")
                Spacer(Modifier.weight(1f))
                if (chosen) Text("✓")
            }
        }
    }
    OutlinedButton(
        onClick = onComplete,
        enabled = checkout.selectedItems.size == SampleItem.entries.size,
        modifier = Modifier.fillMaxWidth().testTag("order.complete"),
    ) { Text("Complete order") }
}

@Composable
private fun Confirmation(checkout: CheckoutModel) {
    Text("Confirmation", style = MaterialTheme.typography.titleMedium)
    Text("Order complete", Modifier.testTag("confirmation.title"),
        style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
    for (item in checkout.selectedItems) Text("${item.title}: $${item.priceCents / 100}")
    Text("Total: $${checkout.totalCents / 100}", Modifier.testTag("confirmation.total"),
        style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
}
