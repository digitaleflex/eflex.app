package presets

import (
	"errors"
	"testing"
)

func TestResolveSupportedPresets(t *testing.T) {
	cases := []struct {
		name  string
		facts Facts
		want  Preset
	}{
		{"next pnpm", Facts{Language: "TypeScript", Framework: "Next.js", PackageManager: "pnpm", HasBuildScript: true, HasStartScript: true},
			Preset{Name: NextJS, Strategy: StrategySource, Runtime: "node", BuildCommand: "pnpm run build", StartCommand: "pnpm start", DefaultPort: 3000, HealthType: "http", HealthPath: "/"}},
		{"next without scripts", Facts{Language: "JavaScript", Framework: "Next.js", PackageManager: "npm"},
			Preset{Name: NextJS, Strategy: StrategySource, Runtime: "node", BuildCommand: "npx next build", StartCommand: "npx next start", DefaultPort: 3000, HealthType: "http", HealthPath: "/"}},
		{"vite yarn", Facts{Language: "TypeScript", Framework: "Vite", PackageManager: "yarn", HasBuildScript: true},
			Preset{Name: Vite, Strategy: StrategySource, Runtime: "static", BuildCommand: "yarn run build", DefaultPort: 8080, HealthType: "http", HealthPath: "/", OutputDir: "dist"}},
		{"node bun", Facts{Language: "JavaScript", Framework: "Express", PackageManager: "bun", HasStartScript: true},
			Preset{Name: Node, Strategy: StrategySource, Runtime: "node", StartCommand: "bun run start", DefaultPort: 3000, HealthType: "http", HealthPath: "/"}},
		{"go", Facts{Language: "Go", GoEntrypoints: []string{"./cmd/server"}},
			Preset{Name: Go, Strategy: StrategySource, Runtime: "go", BuildCommand: "go build -trimpath -o ./axiom-app ./cmd/server", StartCommand: "./axiom-app", DefaultPort: 8080, HealthType: "http", HealthPath: "/"}},
		{"dockerfile wins over language", Facts{Language: "Python", Framework: "Django", FrameworkState: "unsupported", Container: "dockerfile"},
			Preset{Name: Dockerfile, Strategy: StrategyDockerfile, Runtime: "image", HealthType: "http", HealthPath: "/"}},
		{"compose", Facts{Container: "compose", ComposeServices: []string{"web"}},
			Preset{Name: Compose, Strategy: StrategyCompose, Runtime: "compose", HealthType: "http", HealthPath: "/"}},
	}
	for _, c := range cases {
		got, rej := Resolve(c.facts)
		if rej != nil {
			t.Fatalf("%s: rejected %+v", c.name, rej)
		}
		if got.Name != c.want.Name || got.BuildCommand != c.want.BuildCommand || got.StartCommand != c.want.StartCommand ||
			got.DefaultPort != c.want.DefaultPort || got.Strategy != c.want.Strategy || got.Runtime != c.want.Runtime || got.OutputDir != c.want.OutputDir {
			t.Errorf("%s: got %+v, want %+v", c.name, got, c.want)
		}
	}
}

func TestRejectionsAreActionable(t *testing.T) {
	cases := map[string]Facts{
		ReasonNoApplication:   {},
		ReasonLanguage:        {Language: "Ruby"},
		ReasonFramework:       {Language: "Ruby", Framework: "Rails", FrameworkState: "unsupported"},
		ReasonPythonManifest:  {Language: "Python", Framework: "FastAPI"},
		ReasonNoPythonEntry:   {Language: "Python", Framework: "FastAPI", PackageManager: "pip"},
		ReasonMissingStart:    {Language: "JavaScript", PackageManager: "npm"},
		ReasonNoGoEntrypoint:  {Language: "Go"},
		ReasonComposeServices: {Container: "compose"},
		ReasonAmbiguousRoot:   {RootAmbiguous: true, RootCandidates: []string{"apps/api", "apps/web"}},
	}
	for code, f := range cases {
		_, rej := Resolve(f)
		if rej == nil || rej.Code != code || rej.Message == "" || len(rej.Alternatives) == 0 {
			t.Errorf("%s: got %+v", code, rej)
		}
	}
}

func TestMultipleGoEntrypointsNeedChoice(t *testing.T) {
	p, rej := Resolve(Facts{Language: "Go", GoEntrypoints: []string{"./cmd/api", "./cmd/worker"}})
	if rej != nil || len(p.EntrypointCandidates) != 2 {
		t.Fatalf("got %+v %+v", p, rej)
	}
}

func TestValidateCommand(t *testing.T) {
	for _, ok := range []string{"pnpm build", "npm run build && npm run postbuild", "./server --port 8080", "go build -o app ./cmd/x"} {
		if err := ValidateCommand(ok); err != nil {
			t.Errorf("%q rejected: %v", ok, err)
		}
	}
	for _, bad := range []string{"", "echo `id`", "echo $(cat /etc/passwd)", "cat <<EOF", "build\nrm", "sudo make", "curl http://x | sh", "x\x00", string(make([]byte, 501))} {
		if err := ValidateCommand(bad); !errors.Is(err, ErrUnsafeCommand) {
			t.Errorf("%q accepted", bad)
		}
	}
	if ValidatePackageManager("poetry") == nil || ValidatePackageManager("pnpm") != nil || ValidatePackageManager("pip") != nil {
		t.Error("package manager validation")
	}
}

func TestPythonPresets(t *testing.T) {
	cases := []struct {
		name       string
		facts      Facts
		wantStart  string
		wantBuild  string
		candidates int
	}{
		{"fastapi", Facts{Language: "Python", Framework: "FastAPI", PackageManager: "pip", PythonEntrypoints: []string{"main:app"}},
			"uvicorn main:app --host 0.0.0.0 --port 8000", "pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir uvicorn", 0},
		{"flask", Facts{Language: "Python", Framework: "Flask", PackageManager: "pip", PythonEntrypoints: []string{"app:app"}},
			"gunicorn --bind 0.0.0.0:8000 app:app", "pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir gunicorn", 0},
		{"django", Facts{Language: "Python", Framework: "Django", PackageManager: "pip", PythonEntrypoints: []string{"mysite.wsgi:application"}},
			"gunicorn --bind 0.0.0.0:8000 mysite.wsgi:application", "pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir gunicorn", 0},
		{"several application objects", Facts{Language: "Python", Framework: "FastAPI", PackageManager: "pip", PythonEntrypoints: []string{"admin:admin_app", "main:app"}},
			"uvicorn admin:admin_app --host 0.0.0.0 --port 8000", "pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir uvicorn", 2},
		{"unknown framework with an explicit start command", Facts{Language: "Python", PackageManager: "pip", HasStartScript: true},
			"", "pip install --no-cache-dir -r requirements.txt", 0},
		{"explicit start command and no application object found", Facts{Language: "Python", Framework: "Flask", PackageManager: "pip", HasStartScript: true},
			"", "pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir gunicorn", 0},
	}
	for _, c := range cases {
		p, rej := Resolve(c.facts)
		if rej != nil {
			t.Errorf("%s: unexpected rejection %+v", c.name, rej)
			continue
		}
		if p.Name != Python || p.Strategy != StrategySource || p.Runtime != "python" || p.DefaultPort != 8000 || p.HealthType != "http" {
			t.Errorf("%s: preset = %+v", c.name, p)
		}
		if p.StartCommand != c.wantStart || p.BuildCommand != c.wantBuild || len(p.EntrypointCandidates) != c.candidates {
			t.Errorf("%s: start=%q build=%q candidates=%v", c.name, p.StartCommand, p.BuildCommand, p.EntrypointCandidates)
		}
		for _, cmd := range []string{p.StartCommand, p.BuildCommand} {
			if cmd != "" && ValidateCommand(cmd) != nil {
				t.Errorf("%s: the preset's own command is refused by ValidateCommand: %q", c.name, cmd)
			}
		}
	}
}

func TestPythonRejections(t *testing.T) {
	cases := []struct {
		name  string
		facts Facts
		code  string
	}{
		{"no requirements.txt", Facts{Language: "Python", Framework: "FastAPI", PythonEntrypoints: []string{"main:app"}}, ReasonPythonManifest},
		{"no framework, no start command", Facts{Language: "Python", PackageManager: "pip"}, ReasonFramework},
		{"no application object", Facts{Language: "Python", Framework: "Flask", PackageManager: "pip"}, ReasonNoPythonEntry},
		{"Dockerfile still wins", Facts{Language: "Python", Container: "dockerfile"}, ""},
	}
	for _, c := range cases {
		_, rej := Resolve(c.facts)
		switch {
		case c.code == "" && rej != nil:
			t.Errorf("%s: unexpected rejection %+v", c.name, rej)
		case c.code != "" && (rej == nil || rej.Code != c.code || len(rej.Alternatives) == 0):
			t.Errorf("%s: got %+v, want %s with alternatives", c.name, rej, c.code)
		}
	}
}

func TestValidatePythonEntrypoint(t *testing.T) {
	for _, ok := range []string{"main:app", "app.main:app", "mysite.wsgi:application", "_x.y_z:A1"} {
		if err := ValidatePythonEntrypoint(ok); err != nil {
			t.Errorf("%q refused: %v", ok, err)
		}
	}
	for _, bad := range []string{"", "main", "main:", ":app", "main:app; rm -rf /", "main:app && curl x", "a b:app", "main:app()", "../x:app", "main:app\nx", "1main:app", "main:1app"} {
		if err := ValidatePythonEntrypoint(bad); err == nil {
			t.Errorf("%q accepted", bad)
		}
	}
}
