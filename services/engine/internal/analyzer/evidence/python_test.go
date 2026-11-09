package evidence

import (
	"reflect"
	"strings"
	"testing"
)

func entrypoints(t *testing.T, r Result) []string {
	t.Helper()
	f := get(t, r, KindEntrypoint)
	if f.State != StateDetected {
		return nil
	}
	return f.Values
}

func TestPythonFastAPI(t *testing.T) {
	r := Analyze(snap(map[string]string{
		"requirements.txt": "fastapi==0.115\nuvicorn[standard]\n",
		"main.py":          "from fastapi import FastAPI\n\napp = FastAPI(title=\"x\")\n",
	}), Options{})
	assertFinding(t, r, KindLanguage, StateDetected, "Python")
	assertFinding(t, r, KindFramework, StateDetected, "FastAPI")
	assertFinding(t, r, KindPackageManager, StateDetected, "pip")
	f := assertFinding(t, r, KindEntrypoint, StateDetected, "")
	if !reflect.DeepEqual(f.Values, []string{"main:app"}) {
		t.Fatalf("entrypoints = %v", f.Values)
	}
	if ev := f.Evidence[0]; ev.Source != SourceSource || ev.Path != "main.py" || ev.Rule != "python.entrypoint.app" || ev.Lines != "3" {
		t.Fatalf("entrypoint evidence = %+v", ev)
	}
}

func TestPythonEntrypointFollowsTheCodeNotTheFileName(t *testing.T) {
	r := Analyze(snap(map[string]string{
		"requirements.txt": "fastapi\n",
		"server.py":        "from fastapi import FastAPI\napi = FastAPI()\n",
		"main.py":          "# no application here\nprint('hello')\n",
	}), Options{})
	if got := entrypoints(t, r); !reflect.DeepEqual(got, []string{"server:api"}) {
		t.Fatalf("entrypoints = %v, want [server:api]", got)
	}
}

func TestPythonPackageLayout(t *testing.T) {
	r := Analyze(snap(map[string]string{
		"requirements.txt": "fastapi\n",
		"app/__init__.py":  "",
		"app/main.py":      "app = FastAPI()\n",
		"app/routers/x.py": "router = APIRouter()\n",
	}), Options{})
	if got := entrypoints(t, r); !reflect.DeepEqual(got, []string{"app.main:app"}) {
		t.Fatalf("entrypoints = %v", got)
	}
}

func TestPythonInitModuleIsThePackage(t *testing.T) {
	r := Analyze(snap(map[string]string{
		"requirements.txt": "flask\n",
		"app/__init__.py":  "from flask import Flask\napp = Flask(__name__)\n",
	}), Options{})
	if got := entrypoints(t, r); !reflect.DeepEqual(got, []string{"app:app"}) {
		t.Fatalf("entrypoints = %v", got)
	}
}

func TestPythonFlaskVariants(t *testing.T) {
	r := Analyze(snap(map[string]string{
		"requirements.txt": "Flask==3.0\n",
		"wsgi.py":          "from flask import Flask\napplication: Flask = Flask(__name__)\n",
		"microblog.py":     "from app import create_app\napp = create_app()\n",
	}), Options{})
	assertFinding(t, r, KindFramework, StateDetected, "Flask")
	got := entrypoints(t, r)
	want := []string{"microblog:app", "wsgi:application"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("entrypoints = %v, want %v (sorted, deterministic)", got, want)
	}
	rules := map[string]bool{}
	for _, e := range get(t, r, KindEntrypoint).Evidence {
		rules[e.Rule] = true
	}
	if !rules["python.entrypoint.app"] || !rules["python.entrypoint.factory"] {
		t.Fatalf("rules = %v", rules)
	}
}

func TestPythonFactoryIsIgnoredOutsideFlask(t *testing.T) {
	r := Analyze(snap(map[string]string{
		"requirements.txt": "fastapi\n",
		"x.py":             "app = create_app()\n",
	}), Options{})
	if got := entrypoints(t, r); got != nil {
		t.Fatalf("a create_app() call is only meaningful for Flask, got %v", got)
	}
}

func TestPythonDjango(t *testing.T) {
	r := Analyze(snap(map[string]string{
		"requirements.txt":   "Django>=5.0\ngunicorn\n",
		"manage.py":          "#!/usr/bin/env python\n",
		"mysite/__init__.py": "",
		"mysite/settings.py": "DEBUG = True\n",
		"mysite/wsgi.py":     "import os\nfrom django.core.wsgi import get_wsgi_application\napplication = get_wsgi_application()\n",
	}), Options{})
	assertFinding(t, r, KindFramework, StateDetected, "Django")
	if got := entrypoints(t, r); !reflect.DeepEqual(got, []string{"mysite.wsgi:application"}) {
		t.Fatalf("entrypoints = %v", got)
	}
	found := false
	for _, w := range r.Warnings {
		found = found || strings.Contains(w, "collectstatic")
	}
	if !found {
		t.Fatalf("Django must warn about static files, warnings = %v", r.Warnings)
	}
}

func TestPythonDjangoWsgiWithoutApplicationIsNotAnEntrypoint(t *testing.T) {
	r := Analyze(snap(map[string]string{
		"requirements.txt": "django\n",
		"mysite/wsgi.py":   "# placeholder\n",
	}), Options{})
	if got := entrypoints(t, r); got != nil {
		t.Fatalf("entrypoints = %v", got)
	}
}

func TestPythonIgnoresTestsVirtualenvsAndInvalidModuleNames(t *testing.T) {
	r := Analyze(snap(map[string]string{
		"requirements.txt":             "fastapi\n",
		"tests/test_api.py":            "app = FastAPI()\n",
		".venv/lib/site-packages/x.py": "app = FastAPI()\n",
		"my-service/main.py":           "app = FastAPI()\n",
		"api/main.py":                  "app = FastAPI()\n",
	}), Options{})
	if got := entrypoints(t, r); !reflect.DeepEqual(got, []string{"api.main:app"}) {
		t.Fatalf("entrypoints = %v", got)
	}
}

func TestPythonSeveralApplicationsAreAllReported(t *testing.T) {
	r := Analyze(snap(map[string]string{
		"requirements.txt": "fastapi\n",
		"main.py":          "app = FastAPI()\n",
		"admin.py":         "admin_app = FastAPI()\n",
	}), Options{})
	if got := entrypoints(t, r); !reflect.DeepEqual(got, []string{"admin:admin_app", "main:app"}) {
		t.Fatalf("entrypoints = %v", got)
	}
}

func TestPythonClassMustMatchTheDetectedFramework(t *testing.T) {
	r := Analyze(snap(map[string]string{
		"requirements.txt": "fastapi\n",
		"main.py":          "app = Flask(__name__)\n",
	}), Options{})
	if got := entrypoints(t, r); got != nil {
		t.Fatalf("a Flask() call in a FastAPI project is not an entrypoint, got %v", got)
	}
}

func TestPythonWithoutRequirementsHasNoPackageManager(t *testing.T) {
	r := Analyze(snap(map[string]string{
		"pyproject.toml": "[project]\nname = \"x\"\ndependencies = [\"fastapi\"]\n",
		"main.py":        "app = FastAPI()\n",
	}), Options{})
	assertFinding(t, r, KindLanguage, StateDetected, "Python")
	if f := get(t, r, KindPackageManager); f.State == StateDetected {
		t.Fatalf("pip must only be reported with a requirements.txt: %+v", f)
	}
}

func TestPythonVersionFile(t *testing.T) {
	r := Analyze(snap(map[string]string{"requirements.txt": "flask\n", ".python-version": "3.9.18\n"}), Options{})
	assertFinding(t, r, KindRuntimeVersion, StateDetected, "python 3.9")
	found := false
	for _, w := range r.Warnings {
		found = found || (strings.Contains(w, "3.9") && strings.Contains(w, "3.12"))
	}
	if !found {
		t.Fatalf("a different Python version must be flagged, warnings = %v", r.Warnings)
	}

	ok := Analyze(snap(map[string]string{"requirements.txt": "flask\n", "runtime.txt": "python-3.12.4\n"}), Options{})
	assertFinding(t, ok, KindRuntimeVersion, StateDetected, "python 3.12")
	for _, w := range ok.Warnings {
		if strings.Contains(w, "preset builds with") {
			t.Fatalf("no warning expected for the preset's own version: %v", ok.Warnings)
		}
	}
}

func TestPythonAnalysisIsDeterministic(t *testing.T) {
	files := map[string]string{
		"requirements.txt": "flask\n",
		"a.py":             "app = Flask(__name__)\n",
		"b.py":             "app = Flask(__name__)\n",
		"c/__init__.py":    "app = Flask(__name__)\n",
	}
	first := Analyze(snap(files), Options{})
	for i := 0; i < 20; i++ {
		if !reflect.DeepEqual(first, Analyze(snap(files), Options{})) {
			t.Fatal("the analysis must be reproducible")
		}
	}
}
