import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: <CheckCircle size={15} className="text-green-400 shrink-0" />,
  error:   <XCircle    size={15} className="text-red-400 shrink-0"   />,
  warning: <AlertCircle size={15} className="text-yellow-400 shrink-0" />,
  info:    <Info       size={15} className="text-blue-400 shrink-0"  />,
};

const BORDERS = {
  success: 'border-green-500/40',
  error:   'border-red-500/40',
  warning: 'border-yellow-500/40',
  info:    'border-blue-500/40',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration);
    return id;
  }, []);

  const dismiss = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed top-14 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`pointer-events-auto flex items-start gap-2.5 px-3.5 py-3 bg-cloud-card border ${BORDERS[t.type]} rounded shadow-xl animate-slide-up`}>
            {ICONS[t.type]}
            <p className="flex-1 text-xs text-gray-200 leading-relaxed">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="text-gray-600 hover:text-white shrink-0">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
