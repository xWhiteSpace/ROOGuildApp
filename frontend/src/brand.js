export const PRODUCT_NAME = 'VALHALLA';
export const PRODUCT_MARK_SRC = '/assets/brand/valhalla-mark.svg';
export const PRODUCT_LOGO_SRC = '/assets/brand/valhalla-logo.svg';
/** Black transparent artwork → white on dark chrome. */
export const PRODUCT_ON_DARK_CLASS = 'brightness-0 invert';

export function productTitle(guildName) {
  const name = String(guildName || '').trim();
  return name ? `${name} · ${PRODUCT_NAME}` : PRODUCT_NAME;
}

export default { PRODUCT_NAME, PRODUCT_MARK_SRC, PRODUCT_LOGO_SRC, PRODUCT_ON_DARK_CLASS, productTitle };
