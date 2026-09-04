/* The page census, in one place.
 *
 * Two checks sweep every page: the browser suite at desktop width and the phone check at 390. A
 * page added to one list and not the other is a page that gets checked once and shipped twice, so
 * both import this.
 */
export const PAGES = [
  ['index.html', 'home'], ['plans.html', 'category'], ['shop.html', 'category'],
  ['internet.html', 'category'], ['roaming.html', 'category'], ['numbers.html', 'category'],
  ['services.html', 'category'], ['athome.html', 'category'], ['archive.html', 'category'],
  ['offers.html', 'promotion'], ['compare.html', 'pricing'], ['plan-finder.html', 'pricing'],
  ['cart.html', 'cart'], ['checkout.html', 'checkout'], ['orders.html', 'other'],
  ['topup.html', 'other'], ['account.html', 'other'], ['register.html', 'login'],
  ['signin.html', 'login'], ['support.html', 'other'], ['newsletter.html', 'other'],
  ['about.html', 'other'], ['business.html', 'other'], ['operator.html', 'other'],
  ['product.html?id=dev-iphone-16', 'product'], ['product.html?id=plan-go-11-99', 'product'],
];
