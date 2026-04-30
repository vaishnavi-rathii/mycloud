import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Cloud } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: 'admin@mycloud.local', password: 'admin123' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/login', form);
      login(res.data.user, res.data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-cloud-main flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-aws-orange/10 border border-aws-orange/20 rounded-xl mb-3">
            <Cloud size={32} className="text-aws-orange" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">MyCloud</h1>
          <p className="text-gray-500 text-xs mt-1">Self-Hosted Cloud Platform</p>
        </div>

        <div className="aws-card p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded px-3 py-2">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Email address</label>
            <input type="email" className="aws-input w-full"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="admin@mycloud.local" required />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Password</label>
            <input type="password" className="aws-input w-full"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="••••••••" required />
          </div>
          <button type="submit" disabled={loading}
            onClick={handleSubmit}
            className="w-full bg-aws-orange hover:bg-aws-orange-dark disabled:opacity-50 text-black font-semibold rounded py-2.5 text-sm transition-colors">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-600 mt-4">
          Default credentials: admin@mycloud.local / admin123
        </p>
      </div>
    </div>
  );
}
