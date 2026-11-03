import { getProfile, updateProfile } from '../services/tenant.service.js'

export async function getProfileHandler(req, res, next) {
  try {
    const tenant = await getProfile(req.user.tenantId)
    res.json(tenant)
  } catch (err) { next(err) }
}

export async function updateProfileHandler(req, res, next) {
  try {
    const tenant = await updateProfile(req.user.tenantId, req.body)
    res.json(tenant)
  } catch (err) { next(err) }
}
