import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { compare } from "bcryptjs"
import { prisma } from "@/lib/prisma"

const INVALID_CREDENTIALS = "Email ou mot de passe incorrect."

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const email = (credentials.email as string).trim().toLowerCase()
        const password = credentials.password as string

        // Aucun compte n'est créé ici : l'inscription passe par /register.
        // Recherche insensible à la casse : les comptes créés avant la normalisation
        // peuvent contenir des majuscules.
        const user = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
        })

        // Message identique dans tous les cas, pour ne pas révéler si un compte existe.
        if (!user?.hashedPassword) throw new Error(INVALID_CREDENTIALS)

        const isValid = await compare(password, user.hashedPassword)
        if (!isValid) throw new Error(INVALID_CREDENTIALS)

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        }
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
})