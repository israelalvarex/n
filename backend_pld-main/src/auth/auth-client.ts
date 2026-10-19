import { createAuthClient } from "better-auth/client"
import { adminClient, emailOTPClient } from "better-auth/client/plugins" // [!code highlight]

export const authClient = createAuthClient({
	plugins: [
		adminClient(), // [!code highlight]
		emailOTPClient() // [!code highlight]
	]
})