import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useRegister } from '../hooks/useAuth.js'
import { Button } from '../components/ui/Button.jsx'
import { Input } from '../components/ui/Input.jsx'
import { Card, CardBody } from '../components/ui/Card.jsx'

export function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', tenantName: '' })
  const register = useRegister()

  const handle = (e) => {
    e.preventDefault()
    register.mutate(form)
  }

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Voice AI</h1>
          <p className="text-sm text-gray-500 mt-1">Créez votre espace de travail</p>
        </div>

        <Card>
          <CardBody>
            <form onSubmit={handle} className="space-y-4">
              <Input label="Nom" placeholder="Votre nom" value={form.name} onChange={set('name')} required />
              <Input label="Email" type="email" placeholder="vous@exemple.com" value={form.email} onChange={set('email')} required />
              <Input label="Mot de passe" type="password" placeholder="8 caractères minimum" value={form.password} onChange={set('password')} required minLength={8} />
              <Input label="Nom de l'organisation" placeholder="Ma Société" value={form.tenantName} onChange={set('tenantName')} required />

              {register.error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  {register.error.response?.data?.title || 'Erreur lors de la création du compte'}
                </p>
              )}
              <Button type="submit" className="w-full" loading={register.isPending}>
                Créer mon compte
              </Button>
            </form>
          </CardBody>
        </Card>

        <p className="text-center text-sm text-gray-500 mt-4">
          Déjà un compte ?{' '}
          <Link to="/login" className="text-indigo-600 hover:underline font-medium">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  )
}
