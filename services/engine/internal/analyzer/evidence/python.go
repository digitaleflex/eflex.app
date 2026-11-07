package evidence

import (
	"fmt"
	"path"
	"regexp"
	"strings"

	"github.com/digitaleflex/axiom/services/engine/internal/analyzer/snapshot"
	"github.com/digitaleflex/axiom/services/engine/internal/runtime/presets"
)

// Python application detection. The analyzer reads source files only; it never
// imports or runs repository code. Entrypoints come from the code itself
// (`app = FastAPI(...)`, `application = Flask(...)`, Django's wsgi.py), not from
// file naming conventions, so a wrong guess cannot reach the start command.

var (
	// `app = FastAPI(...)`, `application: Flask = Flask(...)`.
	pyAppRe = regexp.MustCompile(`(?m)^([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=\n]+)?=\s*(FastAPI|Flask)\s*\(`)
	// Flask application factory called at module level: `app = create_app()`.
	pyFactoryRe = regexp.MustCompile(`(?m)^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:[A-Za-z_][A-Za-z0-9_.]*\.)?create_app\s*\(`)
	pyWSGIRe    = regexp.MustCompile(`get_wsgi_application\s*\(`)
	pyIdentRe   = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
	pyVersionRe = regexp.MustCompile(`^(?:python-)?(\d+\.\d+)(?:\.\d+)?\s*$`)
)

// pySkipDirs never contain the application entrypoint.
var pySkipDirs = map[string]bool{"tests": true, "test": true, "venv": true, ".venv": true, "env": true, "site-packages": true, "__pycache__": true}

// pyModule turns a file path into a dotted module path (`app/main.py` -> `app.main`,
// `app/__init__.py` -> `app`). It refuses paths that are not importable names.
func pyModule(rel string) (string, bool) {
	parts := strings.Split(strings.TrimSuffix(rel, ".py"), "/")
	if parts[len(parts)-1] == "__init__" {
		parts = parts[:len(parts)-1]
	}
	if len(parts) == 0 {
		return "", false
	}
	for _, p := range parts {
		if !pyIdentRe.MatchString(p) {
			return "", false
		}
	}
	return strings.Join(parts, "."), true
}

func (a *analysis) detectPython() {
	if !a.hasVote(KindLanguage, "Python") {
		return
	}
	if a.exists("requirements.txt") {
		a.vote(KindPackageManager, "pip", 1, Evidence{Source: SourceManifest, Path: a.abs("requirements.txt"), Rule: "python.pm.requirements",
			Explanation: "requirements.txt lists the dependencies installed with pip"})
	}

	// Declared interpreter version (informational: the preset builds with presets.PythonVersion).
	for _, name := range []string{".python-version", "runtime.txt"} {
		f, ok := a.file(name)
		if !ok || !f.Retained {
			continue
		}
		first := strings.TrimSpace(strings.SplitN(string(f.Content), "\n", 2)[0])
		if m := pyVersionRe.FindStringSubmatch(first); m != nil {
			a.vote(KindRuntimeVersion, "python "+m[1], 1, Evidence{Source: SourceManifest, Path: a.abs(name), Lines: "1", Rule: "python.version.file",
				Explanation: name + " declares Python " + m[1]})
			if m[1] != presets.PythonVersion {
				a.warnings = append(a.warnings, fmt.Sprintf("%s declares Python %s; the Axiom Python preset builds with Python %s", name, m[1], presets.PythonVersion))
			}
			break
		}
	}

	fastapi, flask, django := a.hasVote(KindFramework, "FastAPI"), a.hasVote(KindFramework, "Flask"), a.hasVote(KindFramework, "Django")
	if django {
		a.warnings = append(a.warnings, "Django: the Axiom Python preset does not run collectstatic; serve static files with WhiteNoise or a CDN")
	}

	scanned := 0
	a.walk(func(rel string, sf snapshot.File) {
		if scanned >= 300 || !strings.HasSuffix(rel, ".py") || !sf.Retained {
			return
		}
		for _, part := range strings.Split(path.Dir(rel), "/") {
			if pySkipDirs[part] {
				return
			}
		}
		scanned++
		module, ok := pyModule(rel)
		if !ok {
			return
		}
		for _, m := range pyAppRe.FindAllSubmatch(sf.Content, -1) {
			class := string(m[2])
			if (class == "FastAPI" && !fastapi) || (class == "Flask" && !flask) {
				continue
			}
			a.addMulti(KindEntrypoint, module+":"+string(m[1]), Evidence{Source: SourceSource, Path: a.abs(rel), Lines: lineOf(sf.Content, string(m[0])), Rule: "python.entrypoint.app",
				Explanation: string(m[1]) + " is a " + class + " application"})
		}
		if flask {
			for _, m := range pyFactoryRe.FindAllSubmatch(sf.Content, -1) {
				a.addMulti(KindEntrypoint, module+":"+string(m[1]), Evidence{Source: SourceSource, Path: a.abs(rel), Lines: lineOf(sf.Content, string(m[0])), Rule: "python.entrypoint.factory",
					Explanation: string(m[1]) + " is created by a Flask application factory"})
			}
		}
		if django && path.Base(rel) == "wsgi.py" && pyWSGIRe.Match(sf.Content) {
			a.addMulti(KindEntrypoint, module+":application", Evidence{Source: SourceSource, Path: a.abs(rel), Lines: lineOf(sf.Content, "get_wsgi_application"), Rule: "python.entrypoint.django_wsgi",
				Explanation: "wsgi.py exposes the Django WSGI application"})
		}
	})
}
