import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "cvillequilt",
		compatibilityDate: "2026-09-21",
		entrypoint: "worker/index.js",
		observability: {
			enabled: true,
		},
		assets: {
			notFoundHandling: "404-page",
			runWorkerFirst: [
				"/api/*",
				"/admin",
				"/admin/*",
				"/",
			],
		},
		env: {
			MAIL_FROM: bindings.text("website@cvillequilt.org"),
			CONTACT_TO: bindings.text("president@cvillequilt.org"),
			MEMBERSHIP_TO: bindings.text("president@cvillequilt.org"),
			TURNSTILE_SITE_KEY: bindings.text(""),
			SQUARE_LOCATION_ID: bindings.text(""),
			SQUARE_ENV: bindings.text("production"),
			DB: bindings.d1({
				name: "cvillequilt",
				id: "REPLACE_WITH_DATABASE_ID",
			}),
			EMAIL: bindings.sendEmail({}),
			ASSETS: bindings.assets(),
		},
	},
});
