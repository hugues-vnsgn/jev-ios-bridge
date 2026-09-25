import XCTest
@testable import DiagnosticApp

final class CheckoutModelTests: XCTestCase {
    func testOneItemShowsItsPrice() {
        var checkout = CheckoutModel()
        checkout.add(.apple)

        XCTAssertEqual(checkout.totalCents, 200)
    }

    func testTwoItemsShowTheirSum() {
        var checkout = CheckoutModel()
        checkout.add(.apple)
        checkout.add(.bread)

        XCTAssertEqual(checkout.totalCents, 500)
    }
}
