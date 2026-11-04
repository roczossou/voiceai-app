import { Spinner } from './Feedback.jsx'

export function Button({ children, variant = 'primary', size = 'md', loading, className = '', ...props }) {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:outline-offset-2'
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-sm',
    secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 shadow-sm',
    ghost: 'text-gray-600 hover:bg-gray-100',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-sm gap-1.5 min-h-[32px]',
    md: 'px-4 py-2 text-sm gap-2 min-h-[36px]',
    lg: 'px-5 py-2.5 text-base gap-2 min-h-[44px]',
  }
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}
