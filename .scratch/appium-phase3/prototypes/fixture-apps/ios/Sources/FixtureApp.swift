import SwiftUI

private enum Screen: String, CaseIterable, Identifiable {
    case fields, scroll, navigation, duplicates, alias, tree, changing, recorder, hold, detail
    var id: String { rawValue }
}

private struct FixtureEvent: Encodable, Identifiable {
    let control: String
    let kind: String
    let count: Int
    let t: Double
    var durationMs: Double? = nil
    var id: String { "\(control).\(kind).\(count)" }
    var json: String { String(decoding: try! JSONEncoder().encode(self), as: UTF8.self) }
}

@MainActor @Observable
private final class Recorder {
    var events: [FixtureEvent] = []
    private var counts: [String: Int] = [:]

    func record(_ control: String, _ kind: String = "tap", durationMs: Double? = nil) {
        let key = "\(control).\(kind)"
        counts[key, default: 0] += 1
        let event = FixtureEvent(control: control, kind: kind, count: counts[key]!,
                                 t: Date().timeIntervalSince1970, durationMs: durationMs)
        events.append(event)
        print("FIXTURE_EVENT \(event.json)")
        fflush(nil)
    }
}

@main
struct FixtureApp: App {
    @State private var recorder = Recorder()
    @State private var path: [Screen] = []

    var body: some Scene {
        WindowGroup {
            NavigationStack(path: $path) {
                List(Screen.allCases.filter { $0 != .detail }) { screen in
                    Button(screen.rawValue.capitalized) {
                        recorder.record("menu.\(screen.id)")
                        path.append(screen)
                    }
                    .accessibilityIdentifier("menu.\(screen.id)")
                }
                .accessibilityIdentifier("menu.list")
                .simultaneousGesture(DragGesture().onEnded { _ in recorder.record("menu.list", "swipe") })
                .navigationTitle("Fixture menu")
                .navigationDestination(for: Screen.self) { screen in
                    FixtureScreen(screen: screen, recorder: recorder, pushDetail: { path.append(.detail) })
                }
            }
        }
    }
}

private struct FixtureScreen: View {
    let screen: Screen
    let recorder: Recorder
    let pushDetail: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Group {
            switch screen {
            case .fields: FieldsScreen(recorder: recorder)
            case .scroll: ScrollScreen(recorder: recorder)
            case .navigation:
                Button("Push detail") { recorder.record("navigation.push"); pushDetail() }
                    .accessibilityIdentifier("navigation.push")
            case .detail:
                Text("Pushed detail").accessibilityIdentifier("detail.title")
            case .duplicates:
                VStack {
                    Button("Duplicate") { recorder.record("duplicate.top") }
                    Spacer().frame(height: 220)
                    Button("Duplicate") { recorder.record("duplicate.bottom") }
                }
            case .alias: AliasControl(recorder: recorder).frame(width: 260, height: 64)
            case .tree: DeepTree(recorder: recorder).frame(width: 260, height: 120)
            case .changing: ChangingScreen(recorder: recorder)
            case .recorder:
                VStack {
                    HStack {
                        ForEach(["alpha", "beta", "gamma"], id: \.self) { name in
                            Button(name.capitalized) { recorder.record("recorder.\(name)") }
                                .accessibilityIdentifier("recorder.\(name)")
                        }
                    }
                    ScrollView {
                        VStack(alignment: .leading) {
                            ForEach(recorder.events) { event in
                                Text(event.json).font(.caption.monospaced())
                                    .accessibilityIdentifier("event.\(event.id)")
                            }
                        }
                    }
                    .accessibilityIdentifier("recorder.log")
                    .simultaneousGesture(DragGesture().onEnded { _ in recorder.record("recorder.log", "swipe") })
                }
            case .hold: HoldControl(recorder: recorder)
            }
        }
        .padding()
        .navigationTitle(screen.rawValue.capitalized)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Back") { recorder.record("back.\(screen.id)"); dismiss() }
                    .accessibilityIdentifier(screen == .detail ? "detail.back" : "back.\(screen.id)")
            }
        }
    }
}

private struct FieldsScreen: View {
    let recorder: Recorder
    @State private var values = ["", "", "", "", "", "Already filled"]
    @State private var committed = ["", "", "", "", "", "Already filled"]
    private let names = ["plain", "secure", "formatted", "unicode", "empty", "prefilled"]

    private func binding(_ index: Int) -> Binding<String> {
        Binding(get: { values[index] }, set: { value in
            let shown: String
            if index == 2 {
                let digits = value.filter(\.isNumber)
                shown = digits.enumerated().map { offset, digit in
                    (offset == 3 || offset == 6 ? "-" : "") + String(digit)
                }.joined()
            } else { shown = value }
            values[index] = shown
            committed[index] = shown
            recorder.record("field.\(names[index])", "change")
        })
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(names.indices, id: \.self) { index in
                    VStack(alignment: .leading) {
                        if index == 1 {
                            SecureField("Password", text: binding(index))
                                .accessibilityIdentifier("field.secure")
                        } else {
                            TextField(index == 4 ? "Empty hint" : names[index].capitalized, text: binding(index))
                                .accessibilityIdentifier("field.\(names[index])")
                        }
                        Text("Committed \(names[index]): \(committed[index])")
                            .accessibilityIdentifier("committed.\(names[index])")
                    }
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .simultaneousGesture(TapGesture().onEnded { recorder.record("field.\(names[index])", "focus") })
                    .onSubmit { recorder.record("field.\(names[index])", "submit") }
                }
            }
        }
        .accessibilityIdentifier("fields.scroll")
        .simultaneousGesture(DragGesture().onEnded { _ in recorder.record("fields.scroll", "swipe") })
    }
}

private struct ScrollScreen: View {
    let recorder: Recorder
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ScrollView(.horizontal) {
                    HStack {
                        ForEach(0..<12) { n in
                            Button("Horizontal \(n)") { recorder.record("horizontal.\(n)") }
                                .frame(width: 150, height: 60)
                                .accessibilityIdentifier("horizontal.\(n)")
                        }
                    }
                }
                .accessibilityIdentifier("scroll.horizontal")
                .simultaneousGesture(DragGesture().onEnded { _ in recorder.record("scroll.horizontal", "swipe") })
                ForEach(0..<60) { n in
                    Button("Row \(n)") { recorder.record("row.\(n)") }
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .accessibilityIdentifier("row.\(n)")
                }
            }
        }
        .accessibilityIdentifier("scroll.vertical")
        .simultaneousGesture(DragGesture().onEnded { _ in recorder.record("scroll.vertical", "swipe") })
    }
}

private struct DeepTree: UIViewRepresentable {
    let recorder: Recorder
    func makeUIView(context: Context) -> UIView {
        let root = UIView()
        var parent = root
        for depth in 0...72 {
            parent.isAccessibilityElement = false
            parent.accessibilityContainerType = .semanticGroup
            parent.accessibilityIdentifier = "tree.depth.\(depth)"
            parent.accessibilityLabel = "Depth \(depth)"
            let child: UIView
            if depth == 72 {
                let button = UIButton(type: .system)
                button.setTitle("Deep leaf", for: .normal)
                button.accessibilityIdentifier = "tree.leaf"
                button.addAction(UIAction { _ in recorder.record("tree.leaf") }, for: .touchUpInside)
                child = button
            } else { child = UIView() }
            child.translatesAutoresizingMaskIntoConstraints = false
            parent.addSubview(child)
            parent.accessibilityElements = [child]
            NSLayoutConstraint.activate([
                child.leadingAnchor.constraint(equalTo: parent.leadingAnchor),
                child.trailingAnchor.constraint(equalTo: parent.trailingAnchor),
                child.topAnchor.constraint(equalTo: parent.topAnchor),
                child.bottomAnchor.constraint(equalTo: parent.bottomAnchor)
            ])
            parent = child
        }
        return root
    }
    func updateUIView(_ uiView: UIView, context: Context) {}
}

private struct ChangingScreen: View {
    let recorder: Recorder
    @State private var tick = 0
    @State private var delayed = "Waiting"
    @State private var request = 0
    var body: some View {
        VStack(spacing: 24) {
            Text("Tick \(tick)").accessibilityIdentifier("changing.continuous")
            Text(delayed).accessibilityIdentifier("changing.delayed")
            Button("Change after 2 seconds") { recorder.record("changing.trigger"); request += 1 }
                .accessibilityIdentifier("changing.trigger")
        }
        .task {
            while !Task.isCancelled {
                do { try await Task.sleep(for: .milliseconds(200)) } catch { return }
                tick += 1
            }
        }
        .task(id: request) {
            guard request > 0 else { return }
            delayed = "Waiting"
            do { try await Task.sleep(for: .seconds(2)) } catch { return }
            delayed = "Changed \(request)"
        }
    }
}

private struct HoldControl: View {
    let recorder: Recorder
    @State private var began: Date?
    @State private var duration = 0.0
    var body: some View {
        VStack {
            Text("Hold here")
                .frame(width: 260, height: 100).background(.blue.opacity(0.2))
                .accessibilityIdentifier("hold.control")
                .accessibilityAddTraits(.isButton)
                .gesture(DragGesture(minimumDistance: 0).onChanged { _ in
                    if began == nil { began = Date() }
                }.onEnded { _ in
                    duration = Date().timeIntervalSince(began ?? Date()) * 1000
                    began = nil
                    recorder.record("hold.control", "hold", durationMs: duration)
                })
            Text("Duration ms: \(Int(duration))").accessibilityIdentifier("hold.duration")
        }
    }
}

private struct AliasControl: UIViewRepresentable {
    let recorder: Recorder
    func makeUIView(context: Context) -> UIView {
        let wrapper = UIView()
        wrapper.isAccessibilityElement = false
        wrapper.accessibilityContainerType = .semanticGroup
        wrapper.accessibilityLabel = "Alias"
        wrapper.accessibilityTraits = .button
        let button = UIButton(type: .system)
        button.setTitle("Alias", for: .normal)
        button.addAction(UIAction { _ in recorder.record("alias.inner") }, for: .touchUpInside)
        button.translatesAutoresizingMaskIntoConstraints = false
        wrapper.addSubview(button)
        NSLayoutConstraint.activate([
            button.leadingAnchor.constraint(equalTo: wrapper.leadingAnchor),
            button.trailingAnchor.constraint(equalTo: wrapper.trailingAnchor),
            button.topAnchor.constraint(equalTo: wrapper.topAnchor),
            button.bottomAnchor.constraint(equalTo: wrapper.bottomAnchor)
        ])
        wrapper.accessibilityElements = [button]
        return wrapper
    }
    func updateUIView(_ uiView: UIView, context: Context) {}
}
