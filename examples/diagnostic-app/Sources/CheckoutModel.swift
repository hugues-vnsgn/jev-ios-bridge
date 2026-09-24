enum SampleItem: String, CaseIterable, Identifiable {
    case apple
    case bread

    var id: Self { self }

    var title: String {
        switch self {
        case .apple: "Apple"
        case .bread: "Bread"
        }
    }

    var priceCents: Int {
        switch self {
        case .apple: 200
        case .bread: 300
        }
    }
}

struct CheckoutModel {
    private(set) var selectedItems: [SampleItem] = []

    mutating func add(_ item: SampleItem) {
        guard !selectedItems.contains(item) else { return }
        selectedItems.append(item)
    }

    var totalCents: Int {
        selectedItems.last?.priceCents ?? 0
    }
}
