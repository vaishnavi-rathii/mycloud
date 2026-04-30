import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export default function Breadcrumb({ items }) {
  return (
    <nav className="flex items-center gap-1 text-xs text-gray-500 mb-4">
      <Link to="/dashboard" className="hover:text-aws-orange transition-colors">MyCloud</Link>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight size={11} className="text-gray-700" />
          {item.to && i < items.length - 1 ? (
            <Link to={item.to} className="hover:text-aws-orange transition-colors">{item.label}</Link>
          ) : (
            <span className={i === items.length - 1 ? 'text-gray-300' : ''}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
