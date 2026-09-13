import { PRODUCT_LOGO_SRC, PRODUCT_MARK_SRC, PRODUCT_NAME, PRODUCT_ON_DARK_CLASS } from '../brand';

const SIZES = {
  sm: { wrap: 'gap-2', logo: 'h-14', mark: 'h-8' },
  md: { wrap: 'gap-2', logo: 'h-8', mark: 'h-5' },
  lg: { wrap: 'gap-5 sm:gap-8', logo: 'h-32 sm:h-40 drop-shadow-lg', mark: 'h-20 sm:h-24 drop-shadow-lg' },
};

export default function ValhallaLockup({ size = 'md', className = '' }) {
  const s = SIZES[size] || SIZES.md;
  return (
    <span className={`inline-flex items-center ${s.wrap} ${className}`}>
      <img
        src={PRODUCT_LOGO_SRC}
        alt=""
        className={`${s.logo} w-auto object-contain ${PRODUCT_ON_DARK_CLASS}`}
      />
      <img
        src={PRODUCT_MARK_SRC}
        alt={PRODUCT_NAME}
        className={`${s.mark} w-auto object-contain ${PRODUCT_ON_DARK_CLASS}`}
      />
    </span>
  );
}
