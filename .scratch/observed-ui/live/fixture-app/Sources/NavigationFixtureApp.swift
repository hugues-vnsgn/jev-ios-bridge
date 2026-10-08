import SwiftUI

@main
struct NavigationFixtureApp: App {
    var body: some Scene {
        WindowGroup {
            NavigationStack {
                VStack(spacing: 24) {
                    Text("Home")
                        .accessibilityIdentifier("home.heading")
                    NavigationLink {
                        DetailView()
                    } label: {
                        Text("Open details")
                    }
                    .accessibilityIdentifier("open.details")
                }
                .navigationTitle("Home")
            }
        }
    }
}

private struct DetailView: View {
    var body: some View {
        Text("Details")
            .accessibilityIdentifier("details.heading")
            .navigationTitle("Details")
    }
}
