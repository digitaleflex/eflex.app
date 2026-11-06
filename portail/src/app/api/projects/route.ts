import { auth } from '@/lib/auth'
import { PrismaClient } from '@prisma/client'
import { createApplication, deployApplication, setEnvironmentVariable } from '@/lib/coolify'
import { NextRequest, NextResponse } from 'next/server'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  let body: {
    name: string
    repoUrl: string
    branch?: string
    framework?: string
    envVars?: { key: string; value: string }[]
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }

  if (!body.name || !body.repoUrl) {
    return NextResponse.json({ error: 'Nom et URL du dépôt requis' }, { status: 400 })
  }

  const slug = body.name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  // 1. Create project in local database
  const project = await prisma.project.create({
    data: {
      userId: session.user.id,
      name: body.name,
      slug,
      repoUrl: body.repoUrl,
      branch: body.branch || 'main',
      framework: body.framework || '',
      port: 3000,
    },
  })

  // 2. Store environment variables (encrypted at rest, basic for now)
  if (body.envVars && body.envVars.length > 0) {
    await prisma.envVar.createMany({
      data: body.envVars
        .filter((v) => v.key.trim() !== '')
        .map((v) => ({
          projectId: project.id,
          key: v.key,
          value: v.value, // TODO: encrypt with libsodium before production
        })),
    })
  }

  // 3. Create Coolify application
  let coolifyAppId: string | null = null
  let deploymentId: string | null = null
  let deployError: string | null = null

  try {
    const appResult = await createApplication({
      name: slug,
      gitRepository: body.repoUrl,
      gitBranch: body.branch,
    })

    if ('error' in appResult) {
      deployError = appResult.error
    } else {
      coolifyAppId = appResult.id

      // Set env vars on Coolify
      if (body.envVars) {
        for (const v of body.envVars) {
          if (v.key.trim()) {
            await setEnvironmentVariable(coolifyAppId, v.key, v.value)
          }
        }
      }

      // Trigger deployment
      const deployResult = await deployApplication(coolifyAppId)
      if ('error' in deployResult) {
        deployError = deployResult.error
      } else {
        deploymentId = deployResult.deploymentId
      }
    }
  } catch (err: any) {
    deployError = err.message || 'Erreur inconnue avec Coolify'
  }

  // 4. Update project with Coolify IDs
  if (coolifyAppId) {
    await prisma.project.update({
      where: { id: project.id },
      data: { coolifyAppId },
    })
  }

  // 5. Record deployment
  const deployment = await prisma.deployment.create({
    data: {
      projectId: project.id,
      commitSha: 'pending',
      status: deploymentId ? 'building' : deployError ? 'failed' : 'pending',
      coolifyBuildId: deploymentId || null,
      logsSummary: deployError || null,
    },
  })

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
    },
    deployment: {
      id: deployment.id,
      status: deployment.status,
    },
    coolify: {
      appId: coolifyAppId,
      deploymentId,
    },
    warning: deployError,
  })
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    include: {
      deployments: { take: 1, orderBy: { createdAt: 'desc' } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ projects })
}