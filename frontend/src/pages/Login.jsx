import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLogin } from '../hooks/useAuth.js'
import { Button } from '../components/ui/Button.jsx'
import { Input } from '../components/ui/Input.jsx'
import { Card, CardBody } from '../components/ui/Card.jsx'

export function Login() {
  const [form, setForm] = useState({ email: '', password: '' })
  const login = useLogin()

  const handle = (e) => {
    e.preventDefault()
    login.mutate(form)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Voice AI</h1>
          <p className="text-sm text-gray-500 mt-1">Connectez-vous à votre espace</p>
        </div>

        <Card>
          <CardBody className="space-y-4">
            <form onSubmit={handle} className="space-y-4">
              <Input
                label="Email"
                type="email"
                placeholder="vous@exemple.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
              />
              <Input
                label="Mot de passe"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
              />
              {login.error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  {login.error.response?.data?.title || 'Erreur de connexion'}
                </p>
              )}
              <Button type="submit" className="w-full" loading={login.isPending}>
                Se connecter
              </Button>
            </form>
          </CardBody>
        </Card>

        <p className="text-center text-sm text-gray-500 mt-4">
          Pas encore de compte ?{' '}
          <Link to="/register" className="text-indigo-600 hover:underline font-medium">
            Créer un compte
          </Link>
        </p>
      </div>
    </div>
  )
}
