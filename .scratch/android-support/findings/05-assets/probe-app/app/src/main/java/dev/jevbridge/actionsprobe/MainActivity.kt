package dev.jevbridge.actionsprobe

// Throwaway probe app for ticket 05 (actions across Android versions). Not shipped.
import android.os.Bundle
import android.text.InputType
import android.widget.EditText
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
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
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView

class MainActivity : ComponentActivity() {
    @OptIn(ExperimentalComposeUiApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(Modifier.fillMaxSize().semantics { testTagsAsResourceId = true }) { Probe() }
            }
        }
    }
}

@Composable
private fun Probe() {
    var screen by remember { mutableStateOf("fields") }
    Column(Modifier.fillMaxSize().safeDrawingPadding().padding(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (s in listOf("fields", "lists", "anim")) {
                Button(onClick = { screen = s }, modifier = Modifier.testTag("nav.$s")) { Text(s) }
            }
        }
        when (screen) {
            "fields" -> Fields()
            "lists" -> Lists()
            else -> Anim()
        }
    }
}

/** Formats up to 10 digits as (123) 456-7890 without changing the stored value. */
private object PhoneTransformation : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val d = text.text
        val out = buildString {
            d.forEachIndexed { i, c ->
                if (i == 0) append('(')
                if (i == 3) append(") ")
                if (i == 6) append('-')
                append(c)
            }
        }
        val map = object : OffsetMapping {
            override fun originalToTransformed(offset: Int): Int {
                if (offset == 0) return 0
                var seen = 0
                out.forEachIndexed { i, c -> if (c.isDigit()) { seen++; if (seen == offset) return i + 1 } }
                return out.length
            }
            override fun transformedToOriginal(offset: Int) = out.take(offset).count { it.isDigit() }
        }
        return TransformedText(AnnotatedString(out), map)
    }
}

@Composable
private fun Fields() {
    var plain by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var upper by remember { mutableStateOf("") }
    TextField(plain, { plain = it }, Modifier.fillMaxWidth().testTag("field.plain"), label = { Text("Plain") })
    Text("[$plain]", Modifier.testTag("echo.plain"))
    OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth().testTag("field.password"),
        label = { Text("Password") }, visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
    Text("[$password]", Modifier.testTag("echo.password"))
    OutlinedTextField(phone, { v -> phone = v.filter { it.isDigit() }.take(10) }, Modifier.fillMaxWidth().testTag("field.phone"),
        label = { Text("Phone") }, visualTransformation = PhoneTransformation,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone))
    Text("[$phone]", Modifier.testTag("echo.phone"))
    OutlinedTextField(upper, { upper = it.uppercase() }, Modifier.fillMaxWidth().testTag("field.upper"), label = { Text("Upper") })
    Text("[$upper]", Modifier.testTag("echo.upper"))
    // Classic Android Views, for comparison with Compose fields.
    AndroidView({ ctx -> EditText(ctx).apply { hint = "Classic plain"; contentDescription = "classic.plain" } }, Modifier.fillMaxWidth())
    AndroidView({ ctx -> EditText(ctx).apply { hint = "Classic password"; contentDescription = "classic.password"
        inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD } }, Modifier.fillMaxWidth())
}

@Composable
private fun Lists() {
    val lazy = rememberLazyListState()
    val row = rememberLazyListState()
    val col = rememberScrollState()
    Text("lazy.first=${lazy.firstVisibleItemIndex} row.first=${row.firstVisibleItemIndex} col.y=${col.value}", Modifier.testTag("scroll.state"))
    LazyColumn(Modifier.fillMaxWidth().height(260.dp).testTag("list.lazy"), state = lazy) {
        items(200) { i -> Text("Row $i", Modifier.fillMaxWidth().padding(8.dp)) }
    }
    LazyRow(Modifier.fillMaxWidth().testTag("list.row"), state = row, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(50) { i -> Text("Chip $i", Modifier.padding(12.dp)) }
    }
    Column(Modifier.fillMaxWidth().height(200.dp).verticalScroll(col).testTag("list.column")) {
        for (i in 0 until 40) Text("Line $i", Modifier.padding(6.dp))
    }
}

@Composable
private fun Anim() {
    var shown by remember { mutableStateOf(false) }
    var target by remember { mutableStateOf(0) }
    var spinning by remember { mutableStateOf(false) }
    val count by animateIntAsState(target, tween(1500), label = "count")
    Button(onClick = { shown = !shown }, Modifier.testTag("anim.toggle")) { Text("Toggle panel") }
    AnimatedVisibility(shown, enter = slideInVertically(tween(800)) { -it }, exit = slideOutVertically(tween(800)) { -it }) {
        Text("Panel shown", Modifier.testTag("anim.panel").padding(16.dp))
    }
    Button(onClick = { target = if (target == 0) 100 else 0 }, Modifier.testTag("anim.count.go")) { Text("Count") }
    Text("Count: $count", Modifier.testTag("anim.count"))
    Button(onClick = { spinning = !spinning }, Modifier.testTag("anim.spin")) { Text("Spinner") }
    if (spinning) CircularProgressIndicator(Modifier.testTag("anim.spinner"))
}
