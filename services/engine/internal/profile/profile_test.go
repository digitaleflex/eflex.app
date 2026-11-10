package profile

import (
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/digitaleflex/axiom/services/engine/internal/analyzer/evidence"
	"github.com/digitaleflex/axiom/services/engine/internal/analyzer/snapshot"
)

var update = flag.Bool("update", false, "rewrite golden files")

func snap(files map[string]string) snapshot.Snapshot {
	s := snapshot.Snapshot{}
	for p, c := range files {
		s.Files = append(s.Files, snapshot.File{Path: p, Size: int64(len(c)), Content: []byte(c), Retained: true})
	}
	sort.Slice(s.Files, func(i, j int) bool { return s.Files[i].Path < s.Files[j].Path })
	return s
}

func build(files map[string]string, in Inputs) Profile {
	src := Source{RepositoryID: "repo_1", Ref: "main", Commit: strings.Repeat("a", 40)}
	return Build(evidence.Analyze(snap(files), evidence.Options{}), src, in)
}

var fixtures = map[string]map[string]string{
	"nextjs": {
		"package.json":   `{"packageManager":"pnpm@9.1.0","engines":{"node":"20"},"scripts":{"build":"next build","start":"next start"},"dependencies":{"next":"14.2.0"},"devDependencies":{"typescript":"5"}}`,
		"pnpm-lock.yaml": "x", "tsconfig.json": "{}", "next.config.mjs": "x",
		".env.example": "DATABASE_URL=\nNEXTAUTH_SECRET=\n",
	},
	"vite": {
		"package.json": `{"scripts":{"build":"vite build"},"devDependencies":{"vite":"5"}}`, "package-lock.json": "{}", "vite.config.ts": "x",
	},
	"go": {
		"go.mod":             "module example.com/svc\n\ngo 1.23\n",
		"cmd/server/main.go": "package main\nfunc main() { http.ListenAndServe(\":9000\", nil) }",
	},
	"docker": {
		"Dockerfile": "FROM python:3.12\nEXPOSE 8000\n", "requirements.txt": "django==5\n",
	},
	"unsupported": {
		"pyproject.toml": "[project]\ndependencies=['fastapi']\n",
	},
	"unsupported-rails": {
		"Gemfile": "gem 'rails', '~> 7.1'\n",
	},
	"python-fastapi": {
		"requirements.txt": "fastapi==0.115\nuvicorn[standard]\n",
		"main.py":          "from fastapi import FastAPI\napp = FastAPI()\n",
		".env.example":     "DATABASE_URL=\n",
	},
	"python-django": {
		"requirements.txt":   "Django>=5.0\n",
		"manage.py":          "#!/usr/bin/env python\n",
		"mysite/__init__.py": "",
		"mysite/wsgi.py":     "from django.core.wsgi import get_wsgi_application\napplication = get_wsgi_application()\n",
	},
	"python-ambiguous": {
		"requirements.txt": "flask\n",
		"app.py":           "from flask import Flask\napp = Flask(__name__)\n",
		"worker.py":        "from flask import Flask\nworker = Flask(__name__)\n",
	},
	"nuxt": {
		"package.json":   `{"packageManager":"pnpm@9.1.0","scripts":{"build":"nuxt build"},"dependencies":{"nuxt":"3.13.0"},"devDependencies":{"vite":"5"}}`,
		"pnpm-lock.yaml": "x", "nuxt.config.ts": "export default {}", "vite.config.ts": "export default {}",
	},
	"remix": {
		"package.json":      `{"scripts":{"build":"remix build"},"dependencies":{"remix":"2.12.0","@remix-run/serve":"2.12.0"}}`,
		"package-lock.json": "{}", "remix.config.js": "module.exports = {}",
	},
	"solidstart": {
		"package.json":      `{"scripts":{"build":"vinxi build","start":"vinxi start"},"dependencies":{"solid-start":"1.0.0"}}`,
		"package-lock.json": "{}",
	},
	"redwoodjs": {
		"package.json":      `{"scripts":{"build":"rw build","start":"rw serve"},"dependencies":{"@redwoodjs/api":"7.0.0"}}`,
		"package-lock.json": "{}", "redwood.toml": "[web]",
	},
	"astro": {
		"package.json":      `{"scripts":{"build":"astro build"},"dependencies":{"astro":"4.15.0","@astrojs/node":"9.0.0"}}`,
		"package-lock.json": "{}", "astro.config.mjs": "export default {}",
	},
	"sveltekit-static": {
		"package.json":      `{"scripts":{"build":"vite build"},"devDependencies":{"@sveltejs/kit":"2.5.0","@sveltejs/adapter-static":"3.0.0","vite":"5"}}`,
		"package-lock.json": "{}", "svelte.config.js": "export default {}", "vite.config.ts": "export default {}",
	},
	"sveltekit-node": {
		"package.json":      `{"scripts":{"build":"vite build"},"devDependencies":{"@sveltejs/kit":"2.5.0","@sveltejs/adapter-node":"5.0.0","vite":"5"}}`,
		"package-lock.json": "{}", "svelte.config.js": "export default {}", "vite.config.ts": "export default {}",
	},
	"php-generic": {
		"composer.json":    `{"require":{"php":"^8.3","monolog/monolog":"^3"}}`,
		"public/index.php": "<?php\n",
		".env.example":     "APP_ENV=\n",
	},
	"laravel": {
		"composer.json":    `{"require":{"php":"^8.2","laravel/framework":"^11.0"},"scripts":{"post-autoload-dump":["@php artisan package:discover --ansi"]}}`,
		"composer.lock":    "{}",
		"artisan":          "#!/usr/bin/env php\n",
		"public/index.php": "<?php\n",
		"package.json":     `{"devDependencies":{"laravel-vite-plugin":"1","vite":"5"},"scripts":{"build":"vite build"}}`,
		"vite.config.js":   "export default {}\n",
		".env.example":     "APP_KEY=\nDB_CONNECTION=\n",
	},
}

func TestGoldenProfiles(t *testing.T) {
	for name, files := range fixtures {
		t.Run(name, func(t *testing.T) {
			got, _ := json.MarshalIndent(build(files, Inputs{}), "", "  ")
			path := filepath.Join("testdata", "golden", name+".json")
			if *update {
				_ = os.MkdirAll(filepath.Dir(path), 0o755)
				if err := os.WriteFile(path, append(got, '\n'), 0o644); err != nil {
					t.Fatal(err)
				}
			}
			want, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("missing golden file (run go test -update): %v", err)
			}
			if strings.TrimSpace(string(want)) != strings.TrimSpace(string(got)) {
				t.Fatalf("profile changed for %s:\n%s", name, got)
			}
		})
	}
}

func TestReadyNextJSProfile(t *testing.T) {
	p := build(fixtures["nextjs"], Inputs{})
	if p.Status != StatusReady || p.Preset != "nextjs" || p.SchemaVersion != 1 {
		t.Fatalf("status=%s preset=%s blocking=%+v", p.Status, p.Preset, p.Blocking)
	}
	if p.BuildCommand.Value != "pnpm run build" || p.BuildCommand.Provenance != ProvenanceDetected {
		t.Fatalf("build = %+v", p.BuildCommand)
	}
	if p.Port.Value != 3000 || p.Port.Provenance != ProvenanceDefault {
		t.Fatalf("default port must be labelled default, never detected: %+v", p.Port)
	}
	if p.HealthCheck.Provenance != ProvenanceDefault || p.HealthCheck.Value.Path != "/" {
		t.Fatalf("health = %+v", p.HealthCheck)
	}
	if len(p.Configuration) != 2 || !p.Configuration[0].Secret {
		t.Fatalf("configuration = %+v", p.Configuration)
	}
	if !strings.Contains(p.Summary, "Next.js") || !strings.Contains(p.Summary, "pnpm") || !p.Deployable() {
		t.Fatalf("summary = %q", p.Summary)
	}
}

func TestUnsupportedNeverDeployable(t *testing.T) {
	p := build(fixtures["unsupported"], Inputs{})
	if p.Status != StatusUnsupported || p.Deployable() || p.Unsupported == nil || p.Unsupported.Code == "" || len(p.Unsupported.Alternatives) == 0 {
		t.Fatalf("unsupported = %+v", p)
	}
	d := build(fixtures["docker"], Inputs{})
	if d.Status != StatusReady || d.Preset != "dockerfile" || d.Port.Value != 8000 || d.Port.Provenance != ProvenanceDetected {
		t.Fatalf("Dockerfile makes any stack deployable: %+v", d)
	}
}

func TestAmbiguityBlocksUntilResolved(t *testing.T) {
	files := map[string]string{"package.json": `{"scripts":{"start":"node index.js"}}`, "package-lock.json": "{}", "yarn.lock": "x"}
	p := build(files, Inputs{})
	if p.Status != StatusNeedsReview || p.Blocking[0].Field != "packageManager" || p.Blocking[0].Code != "ambiguous" || len(p.Blocking[0].Options) != 2 {
		t.Fatalf("blocking = %+v", p.Blocking)
	}
	pm := "yarn"
	p = build(files, Inputs{Overrides: Hints{PackageManager: &pm}})
	if p.Status != StatusReady || p.PackageManager.Value != "yarn" || p.PackageManager.Provenance != ProvenanceOverride || p.StartCommand.Value != "yarn start" {
		t.Fatalf("override must resolve: %+v / %+v", p.Blocking, p.PackageManager)
	}
}

func TestOverridesAndManifestPrecedence(t *testing.T) {
	manifestPort, overridePort := 4000, 5000
	start := "node dist/server.js"
	p := build(fixtures["nextjs"], Inputs{Manifest: Hints{Port: &manifestPort}, Overrides: Hints{Port: &overridePort, StartCommand: &start}})
	if p.Port.Value != 5000 || p.Port.Provenance != ProvenanceOverride || p.Port.Replaced == nil || *p.Port.Replaced != 4000 {
		t.Fatalf("override > manifest > default: %+v", p.Port)
	}
	if p.StartCommand.Value != start || p.StartCommand.Replaced == nil || *p.StartCommand.Replaced != "pnpm start" {
		t.Fatalf("start = %+v", p.StartCommand)
	}
	bad := "echo `id`"
	p = build(fixtures["nextjs"], Inputs{Overrides: Hints{BuildCommand: &bad}})
	if p.Status != StatusNeedsReview || p.BuildCommand.Value != "pnpm run build" || p.Blocking[0].Code != "invalid_override" {
		t.Fatalf("unsafe override must be rejected, not applied: %+v %+v", p.BuildCommand, p.Blocking)
	}
}

func TestPortRules(t *testing.T) {
	// Dockerfile without EXPOSE: port required.
	p := build(map[string]string{"Dockerfile": "FROM alpine\n"}, Inputs{})
	if p.Status != StatusNeedsReview || p.Blocking[0].Field != "port" || p.Blocking[0].Code != "not_detected" {
		t.Fatalf("missing port: %+v", p.Blocking)
	}
	port := 8080
	if p = build(map[string]string{"Dockerfile": "FROM alpine\n"}, Inputs{Overrides: Hints{Port: &port}}); p.Status != StatusReady {
		t.Fatalf("port override must resolve: %+v", p.Blocking)
	}
	// Conflicting ports.
	p = build(map[string]string{"Dockerfile": "EXPOSE 3000\n", "package.json": `{"scripts":{"start":"node x --port 4000"}}`}, Inputs{})
	found := false
	for _, i := range p.Blocking {
		found = found || (i.Field == "port" && i.Code == "ambiguous")
	}
	if !found {
		t.Fatalf("conflicting ports must block: %+v", p.Blocking)
	}
}

func TestGoEntrypointsAndCompose(t *testing.T) {
	files := map[string]string{"go.mod": "module m\n\ngo 1.23\n", "cmd/api/main.go": "package main\nfunc main() {}", "cmd/worker/main.go": "package main\nfunc main() {}"}
	p := build(files, Inputs{})
	if p.Status != StatusNeedsReview || p.Blocking[0].Field != "entrypoint" {
		t.Fatalf("entrypoint choice: %+v", p.Blocking)
	}
	entry := "./cmd/api"
	p = build(files, Inputs{Overrides: Hints{Entrypoint: &entry}})
	if p.Status != StatusReady || p.BuildCommand.Value != "go build -trimpath -o ./axiom-app ./cmd/api" {
		t.Fatalf("entrypoint override: %+v %+v", p.BuildCommand, p.Blocking)
	}
	c := build(map[string]string{"compose.yaml": "services:\n  web:\n    build: .\n    ports: [\"80:3000\"]\n  db:\n    image: postgres\n"}, Inputs{})
	if c.Status != StatusReady || c.Preset != "compose" || c.PublicService != "web" || c.Port.Value != 3000 || len(c.Services) != 2 {
		t.Fatalf("compose: %+v", c)
	}
}

func TestMonorepoRequiresRoot(t *testing.T) {
	p := build(map[string]string{"apps/web/package.json": `{"dependencies":{"next":"14"}}`, "apps/api/go.mod": "module m\n"}, Inputs{})
	if p.Status != StatusUnsupported || p.Unsupported.Code != "AMBIGUOUS_APPLICATION_ROOT" {
		t.Fatalf("monorepo: %+v", p.Unsupported)
	}
}

func TestStaticPresetRejectsStartCommand(t *testing.T) {
	start := "node server.js"
	p := build(fixtures["vite"], Inputs{Overrides: Hints{StartCommand: &start}})
	if p.Status != StatusNeedsReview || p.StartCommand.Set() || p.Blocking[0].Field != "startCommand" || p.Blocking[0].Code != "invalid_override" {
		t.Fatalf("static preset start override: %+v %+v", p.StartCommand, p.Blocking)
	}
}

func TestNodeFrameworkProfiles(t *testing.T) {
	cases := []struct {
		name   string
		preset string
		start  string
		port   int
	}{
		{"nuxt", "nuxt", "node .output/server/index.mjs", 3000},
		{"remix", "remix", "npx remix-serve ./build/server/index.js", 3000},
		{"solidstart", "solidstart", "npm start", 3000},
		{"redwoodjs", "redwoodjs", "npm start", 8910},
		{"astro", "astro", "node ./dist/server/entry.mjs", 3000},
		{"sveltekit-static", "sveltekit", "", 8080},
		{"sveltekit-node", "sveltekit", "node build/index.js", 3000},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p := build(fixtures[c.name], Inputs{})
			if p.Status != StatusReady || p.Preset != c.preset {
				t.Fatalf("profile = %+v", p)
			}
			if p.StartCommand.Value != c.start || p.Port.Value != c.port {
				t.Fatalf("start=%q port=%d (want %q/%d)", p.StartCommand.Value, p.Port.Value, c.start, c.port)
			}
			if c.start == "" && p.StartCommand.Set() {
				t.Fatalf("static preset must have no start command: %+v", p.StartCommand)
			}
		})
	}
}

func TestPHPProfiles(t *testing.T) {
	generic := build(fixtures["php-generic"], Inputs{})
	if generic.Status != StatusReady || generic.Preset != "php" || generic.PackageManager.Value != "composer" {
		t.Fatalf("generic php = %+v", generic)
	}
	if generic.Port.Value != 8080 || generic.Port.Provenance != ProvenanceDefault {
		t.Fatalf("php port = %+v", generic.Port)
	}
	if !strings.Contains(generic.Summary, "Composer") || !strings.Contains(generic.Summary, "PHP-FPM") {
		t.Fatalf("summary = %q", generic.Summary)
	}

	laravel := build(fixtures["laravel"], Inputs{})
	if laravel.Status != StatusReady || laravel.Preset != "laravel" || laravel.Framework.Value != "Laravel" {
		t.Fatalf("laravel = %+v", laravel)
	}
	if !strings.Contains(laravel.BuildCommand.Value, "--no-scripts") || laravel.StartCommand.Value != "sh /usr/local/bin/axiom-start" {
		t.Fatalf("laravel commands = %+v / %+v", laravel.BuildCommand, laravel.StartCommand)
	}
	if len(laravel.Configuration) != 2 {
		t.Fatalf("configuration = %+v", laravel.Configuration)
	}
	if !laravel.Deployable() {
		t.Fatalf("laravel must be deployable: %+v", laravel.Blocking)
	}

	// A frontend tool is not the application framework of a PHP app.
	tools := build(map[string]string{
		"composer.json":    `{"require":{"php":"^8.3"}}`,
		"public/index.php": "<?php",
		"package.json":     `{"devDependencies":{"vite":"5"},"scripts":{"build":"vite build"}}`,
	}, Inputs{})
	if tools.Preset != "php" || tools.Framework.Set() || tools.Status != StatusReady {
		t.Fatalf("generic php with Vite = %+v (framework %+v)", tools, tools.Framework)
	}
}
