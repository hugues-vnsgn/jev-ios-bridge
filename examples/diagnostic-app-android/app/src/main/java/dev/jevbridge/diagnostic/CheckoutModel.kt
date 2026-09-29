package dev.jevbridge.diagnostic

enum class SampleItem(val title: String, val priceCents: Int) {
    Apple("Apple", 200),
    Bread("Bread", 300),
}

data class CheckoutModel(val selectedItems: List<SampleItem> = emptyList()) {
    fun add(item: SampleItem): CheckoutModel =
        if (item in selectedItems) this else copy(selectedItems = selectedItems + item)

    val totalCents: Int
        get() = selectedItems.lastOrNull()?.priceCents ?: 0
}
