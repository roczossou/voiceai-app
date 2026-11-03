import { prisma } from '../src/services/db.js'

// Copie one-off de agent.config.systemPrompt vers agent.remarks,
// pour ne pas perdre les prompts métier rédigés à la main avant
// le passage au profil entreprise structuré.
const agents = await prisma.agent.findMany({ select: { id: true, name: true, config: true, remarks: true } })

let migrated = 0
for (const agent of agents) {
  const systemPrompt = agent.config?.systemPrompt
  if (!systemPrompt?.trim() || agent.remarks?.trim()) continue

  await prisma.agent.update({
    where: { id: agent.id },
    data: { remarks: systemPrompt.trim() },
  })
  console.log(`✓ ${agent.name} (${agent.id}) — ${systemPrompt.length} caractères migrés`)
  migrated++
}

console.log(`\nTerminé : ${migrated}/${agents.length} agent(s) migré(s).`)
process.exit(0)
