export default function Button({ children, variant = 'primary', size = 'sm', disabled, loading, onClick, type = 'button', className = '', icon: Icon }) {
  const base = 'inline-flex items-center gap-1.5 font-medium rounded transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-cloud-card disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = { xs: 'px-2.5 py-1 text-xs', sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm' };
  const variants = {
    primary: 'bg-aws-orange hover:bg-aws-orange-dark text-black focus:ring-aws-orange',
    secondary: 'bg-cloud-card border border-cloud-border text-gray-300 hover:bg-cloud-hover hover:text-white focus:ring-gray-600',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-600',
    ghost: 'text-gray-400 hover:text-white hover:bg-cloud-hover focus:ring-gray-600',
    link: 'text-blue-400 hover:text-blue-300 hover:underline p-0 focus:ring-0',
  };
  return (
    <button type={type} disabled={disabled || loading} onClick={onClick}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {loading ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> : Icon ? <Icon size={12} /> : null}
      {children}
    </button>
  );
}
