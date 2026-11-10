import SwiftUI

@main
struct DiagnosticApp: App {
    var body: some Scene {
        WindowGroup {
            if UserDefaults.standard.string(forKey: "screen") == "fields" {
                TextFieldsView()
            } else {
                ChooseItemsView()
            }
        }
    }
}

private struct ChooseItemsView: View {
    @State private var checkout = CheckoutModel()

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 20) {
                Text("Choose two items")
                    .font(.title.bold())

                Text("Selected: \(checkout.selectedItems.isEmpty ? "None" : checkout.selectedItems.map(\.title).joined(separator: ", "))")
                    .accessibilityIdentifier("selection.summary")

                ForEach(SampleItem.allCases) { item in
                    Button {
                        checkout.add(item)
                    } label: {
                        HStack {
                            Text("Add \(item.title) ($\(item.priceCents / 100))")
                            Spacer()
                            if checkout.selectedItems.contains(item) {
                                Image(systemName: "checkmark.circle.fill")
                            }
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(checkout.selectedItems.contains(item))
                    .accessibilityIdentifier("choose.\(item.rawValue)")
                }

                NavigationLink {
                    ConfirmationView(checkout: checkout)
                } label: {
                    Text("Complete order")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(checkout.selectedItems.count != SampleItem.allCases.count)
                .accessibilityIdentifier("order.complete")

                Spacer()
            }
            .padding()
            .navigationTitle("Sample Shop")
        }
    }
}

private struct ConfirmationView: View {
    let checkout: CheckoutModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Order complete")
                .font(.title.bold())
                .accessibilityIdentifier("confirmation.title")

            ForEach(checkout.selectedItems) { item in
                Text("\(item.title): $\(item.priceCents / 100)")
            }

            Text("Total: $\(checkout.totalCents / 100)")
                .font(.title2.bold())
                .accessibilityIdentifier("confirmation.total")

            Spacer()
        }
        .padding()
        .navigationTitle("Confirmation")
    }
}

/// Launched with `-screen fields`: text fields that carry no accessibility identifier.
private struct TextFieldsView: View {
    @State private var nickname = ""
    @State private var unnamed = ""
    @State private var firstNote = ""
    @State private var secondNote = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Text fields")
                .font(.title.bold())

            Text("Label only")
            TextField("", text: $nickname)
                .accessibilityLabel("Nickname")

            Text("No name")
            TextField("", text: $unnamed)

            Text("Shared name")
            TextField("", text: $firstNote)
                .accessibilityLabel("Note")
            TextField("", text: $secondNote)
                .accessibilityLabel("Note")

            Text("Shown: \(nickname) | \(unnamed) | \(firstNote) | \(secondNote)")
                .accessibilityIdentifier("fields.echo")

            Spacer()
        }
        .textFieldStyle(.roundedBorder)
        .padding()
    }
}
