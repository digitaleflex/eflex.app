package e2e

import "testing"

// Reference Python applications, each driven through the whole path:
// snapshot → analysis → profile → plan → real pip install and image build → real container
// → real health probe → LIVE. They need network access to PyPI (CI has it).
//
// None of the requirements lists the ASGI/WSGI server: the preset installs it, which is the
// path a minimal repository takes.

const pythonBaseImage = "python:3.12-slim-bookworm"

func pythonScenarios() []scenario {
	return []scenario{
		{
			slug: "e2e-fastapi", container: "axiom-e2e-py-fastapi", preset: "python", port: 8000,
			wantBody: "axiom fastapi e2e ok", pull: []string{pythonBaseImage},
			files: map[string]string{
				"requirements.txt": "fastapi==0.115.6\n",
				"main.py":          "from fastapi import FastAPI\n\napp = FastAPI()\n\n\n@app.get(\"/\")\ndef root():\n    return {\"status\": \"axiom fastapi e2e ok\"}\n",
			},
		},
		{
			slug: "e2e-flask", container: "axiom-e2e-py-flask", preset: "python", port: 8000,
			wantBody: "axiom flask e2e ok", pull: []string{pythonBaseImage},
			files: map[string]string{
				"requirements.txt": "flask==3.0.3\n",
				"app.py":           "from flask import Flask\n\napp = Flask(__name__)\n\n\n@app.route(\"/\")\ndef index():\n    return \"axiom flask e2e ok\"\n",
			},
		},
		{
			slug: "e2e-django", container: "axiom-e2e-py-django", preset: "python", port: 8000,
			wantBody: "axiom django e2e ok", pull: []string{pythonBaseImage},
			files: map[string]string{
				"requirements.txt":   "Django==5.1.4\n",
				"manage.py":          "#!/usr/bin/env python\nimport os, sys\n\nos.environ.setdefault(\"DJANGO_SETTINGS_MODULE\", \"mysite.settings\")\nfrom django.core.management import execute_from_command_line\n\nexecute_from_command_line(sys.argv)\n",
				"mysite/__init__.py": "",
				"mysite/settings.py": "SECRET_KEY = \"e2e-only\"\nDEBUG = False\nALLOWED_HOSTS = [\"*\"]\nROOT_URLCONF = \"mysite.urls\"\nINSTALLED_APPS = []\nMIDDLEWARE = []\nUSE_TZ = True\n",
				"mysite/urls.py":     "from django.http import HttpResponse\nfrom django.urls import path\n\nurlpatterns = [path(\"\", lambda request: HttpResponse(\"axiom django e2e ok\"))]\n",
				"mysite/wsgi.py":     "import os\n\nfrom django.core.wsgi import get_wsgi_application\n\nos.environ.setdefault(\"DJANGO_SETTINGS_MODULE\", \"mysite.settings\")\napplication = get_wsgi_application()\n",
			},
		},
	}
}

func TestPythonToLive(t *testing.T) {
	for _, sc := range pythonScenarios() {
		t.Run(sc.slug, func(t *testing.T) { runScenario(t, sc) })
	}
}
