import unittest
from src.pricing import total_price


class PricingTests(unittest.TestCase):
    def test_three_items(self):
        self.assertEqual(total_price(12, 3), 36)

    def test_empty_basket(self):
        self.assertEqual(total_price(12, 0), 0)


if __name__ == "__main__":
    unittest.main()
