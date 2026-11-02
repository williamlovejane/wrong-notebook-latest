import { DefaultSession } from "next-auth"

declare module "next-auth" {
    interface Session {
        user: {
            id: string
            role?: string
            /** 管理员仍在使用默认密码，必须先修改 */
            mustChangePassword?: boolean
        } & DefaultSession["user"]
    }

    interface User {
        role?: string
        isActive?: boolean
        mustChangePassword?: boolean
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id: string
        role?: string
        mustChangePassword?: boolean
    }
}
