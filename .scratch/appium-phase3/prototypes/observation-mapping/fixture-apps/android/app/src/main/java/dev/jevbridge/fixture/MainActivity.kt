package dev.jevbridge.fixture

import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.delay
import org.json.JSONObject

private enum class Screen { Menu, Fields, Scroll, Navigation, Detail, Duplicates, Alias, Tree, Changing, Recorder, Hold }

private data class FixtureEvent(val control: String, val kind: String, val count: Int, val t: Double, val durationMs: Long? = null) {
    val json: String get() = JSONObject().apply {
        put("control", control)
        put("kind", kind)
        put("count", count)
        put("t", t)
        durationMs?.let { put("durationMs", it) }
    }.toString()
}

private class Recorder {
    val events = mutableStateListOf<FixtureEvent>()
    private val counts = mutableMapOf<Pair<String, String>, Int>()

    fun record(control: String, kind: String = "tap", durationMs: Long? = null) {
        val key = control to kind
        val count = (counts[key] ?: 0) + 1
        counts[key] = count
        val event = FixtureEvent(control, kind, count, System.currentTimeMillis() / 1000.0, durationMs)
        events.add(event)
        Log.i("Fixture", "FIXTURE_EVENT ${event.json}")
    }
}

class MainActivity : ComponentActivity() {
    @OptIn(ExperimentalComposeUiApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(Modifier.fillMaxSize().semantics { testTagsAsResourceId = true }) { FixtureApp() }
            }
        }
    }
}

@Composable
private fun FixtureApp() {
    val recorder = remember { Recorder() }
    var screen by rememberSaveable { mutableStateOf(Screen.Menu) }
    fun back() {
        recorder.record("back.${screen.name.lowercase()}", "back")
        screen = if (screen == Screen.Detail) Screen.Navigation else Screen.Menu
    }
    BackHandler(screen != Screen.Menu) { back() }
    Column(Modifier.fillMaxSize().safeDrawingPadding().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(if (screen == Screen.Menu) "Fixture menu" else screen.name, Modifier.testTag("screen.title"), style = MaterialTheme.typography.titleLarge)
        if (screen != Screen.Menu) Button(onClick = { back() }, modifier = Modifier.testTag("back.${screen.name.lowercase()}")) { Text("Back") }
        when (screen) {
            Screen.Menu -> Column(Modifier.verticalScroll(rememberScrollState()).testTag("menu.list").recordSwipes("menu.list", recorder)) {
                Screen.entries.filter { it != Screen.Menu && it != Screen.Detail }.forEach { target ->
                    Button(onClick = { recorder.record("menu.${target.name.lowercase()}"); screen = target }, modifier = Modifier.fillMaxWidth().testTag("menu.${target.name.lowercase()}")) { Text(target.name) }
                }
            }
            Screen.Fields -> FieldsScreen(recorder)
            Screen.Scroll -> ScrollScreen(recorder)
            Screen.Navigation -> Button(onClick = { recorder.record("navigation.push"); screen = Screen.Detail }, modifier = Modifier.testTag("navigation.push")) { Text("Push detail") }
            Screen.Detail -> Text("Pushed detail", Modifier.testTag("detail.title"))
            Screen.Duplicates -> {
                Button(onClick = { recorder.record("duplicate.top") }) { Text("Duplicate") }
                Spacer(Modifier.height(220.dp))
                Button(onClick = { recorder.record("duplicate.bottom") }) { Text("Duplicate") }
            }
            Screen.Alias -> AliasControl(recorder)
            Screen.Tree -> DeepTree(0, recorder)
            Screen.Changing -> ChangingScreen(recorder)
            Screen.Recorder -> {
                Row {
                    listOf("alpha", "beta", "gamma").forEach { name ->
                        Button(onClick = { recorder.record("recorder.$name") }, modifier = Modifier.testTag("recorder.$name")) { Text(name) }
                    }
                }
                Column(Modifier.verticalScroll(rememberScrollState()).testTag("recorder.log").recordSwipes("recorder.log", recorder)) {
                    recorder.events.forEach { event ->
                        key(event.control, event.kind, event.count) {
                            Text(event.json, Modifier.testTag("event.${event.control}.${event.kind}.${event.count}"), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
            Screen.Hold -> HoldControl(recorder)
        }
    }
}

private fun Modifier.recordSwipes(control: String, recorder: Recorder) = pointerInput(control) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        var moved = false
        do {
            val event = awaitPointerEvent(androidx.compose.ui.input.pointer.PointerEventPass.Final)
            moved = moved || event.changes.any { (it.position - down.position).getDistance() > viewConfiguration.touchSlop }
        } while (event.changes.any { it.pressed })
        if (moved) recorder.record(control, "swipe")
    }
}

@Composable
private fun FieldsScreen(recorder: Recorder) {
    val names = listOf("plain", "secure", "formatted", "unicode", "empty", "prefilled")
    Column(Modifier.verticalScroll(rememberScrollState()).testTag("fields.scroll").recordSwipes("fields.scroll", recorder), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        names.forEach { name ->
            key(name) {
                var value by rememberSaveable { mutableStateOf(if (name == "prefilled") "Already filled" else "") }
                OutlinedTextField(
                    value = value,
                    onValueChange = { next ->
                        value = if (name == "formatted") next.filter(Char::isDigit).chunked(3).joinToString("-") else next
                        recorder.record("field.$name", "change")
                    },
                    label = { Text(name) },
                    placeholder = { Text(if (name == "empty") "Empty hint" else name) },
                    visualTransformation = if (name == "secure") PasswordVisualTransformation() else VisualTransformation.None,
                    keyboardOptions = KeyboardOptions(keyboardType = if (name == "secure") KeyboardType.Password else KeyboardType.Text),
                    keyboardActions = KeyboardActions(onDone = { recorder.record("field.$name", "submit") }),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().testTag("field.$name").pointerInput(name) {
                        awaitEachGesture {
                            awaitFirstDown(requireUnconsumed = false)
                            recorder.record("field.$name", "focus")
                            waitForUpOrCancellation()
                        }
                    },
                )
                Text("Committed $name: ${if (name == "secure") "•".repeat(value.length) else value}", Modifier.testTag("committed.$name"))
            }
        }
    }
}

@Composable
private fun ScrollScreen(recorder: Recorder) {
    Column(Modifier.verticalScroll(rememberScrollState()).testTag("scroll.vertical").recordSwipes("scroll.vertical", recorder)) {
        Row(Modifier.horizontalScroll(rememberScrollState()).testTag("scroll.horizontal").recordSwipes("scroll.horizontal", recorder)) {
            repeat(12) { n ->
                Button(onClick = { recorder.record("horizontal.$n") }, modifier = Modifier.width(150.dp).height(60.dp).testTag("horizontal.$n")) { Text("Horizontal $n") }
            }
        }
        repeat(60) { n ->
            Button(onClick = { recorder.record("row.$n") }, modifier = Modifier.fillMaxWidth().height(56.dp).testTag("row.$n")) { Text("Row $n") }
        }
    }
}

@Composable
private fun DeepTree(depth: Int, recorder: Recorder) {
    Box(Modifier.semantics(mergeDescendants = false) { contentDescription = "Depth $depth" }.testTag("tree.depth.$depth")) {
        if (depth < 72) DeepTree(depth + 1, recorder)
        else Button(onClick = { recorder.record("tree.leaf") }, modifier = Modifier.testTag("tree.leaf")) { Text("Deep leaf") }
    }
}

@Composable
private fun ChangingScreen(recorder: Recorder) {
    var tick by remember { mutableIntStateOf(0) }
    var request by remember { mutableIntStateOf(0) }
    var delayed by remember { mutableStateOf("Waiting") }
    LaunchedEffect(Unit) { while (true) { delay(200); tick++ } }
    LaunchedEffect(request) {
        if (request > 0) { delayed = "Waiting"; delay(2000); delayed = "Changed $request" }
    }
    Text("Tick $tick", Modifier.testTag("changing.continuous"))
    Text(delayed, Modifier.testTag("changing.delayed"))
    Button(onClick = { recorder.record("changing.trigger"); request++ }, modifier = Modifier.testTag("changing.trigger")) { Text("Change after 2 seconds") }
}

@Composable
private fun HoldControl(recorder: Recorder) {
    var duration by remember { mutableLongStateOf(0) }
    Text("Hold here", Modifier.size(260.dp, 100.dp).testTag("hold.control").semantics { role = Role.Button }.pointerInput(Unit) {
        awaitEachGesture {
            val down = awaitFirstDown()
            val up = waitForUpOrCancellation()
            if (up != null) {
                duration = up.uptimeMillis - down.uptimeMillis
                recorder.record("hold.control", "hold", duration)
            }
        }
    })
    Text("Duration ms: $duration", Modifier.testTag("hold.duration"))
}

@Composable
private fun AliasControl(recorder: Recorder) {
    AndroidView(modifier = Modifier.size(260.dp, 64.dp), factory = { context ->
        FrameLayout(context).apply {
            contentDescription = "Alias"
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
            val inner = android.widget.Button(context).apply {
                text = "Alias"
                setOnClickListener { recorder.record("alias.inner") }
            }
            addView(inner, FrameLayout.LayoutParams(-1, -1))
            setOnClickListener { inner.performClick() }
        }
    })
}
