package php

import (
	"flag"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

var update = flag.Bool("update", false, "rewrite golden files")

func write(t *testing.T, dir string, files map[string]string) {
	t.Helper()
	for name, content := range files {
		path := filepath.Join(dir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestDetect(t *testing.T) {
	t.Run("laravel with npm assets", func(t *testing.T) {
		dir := t.TempDir()
		write(t, dir, map[string]string{
			"composer.json":     `{"scripts":{"build":"x"}}`,
			"composer.lock":     "{}",
			"artisan":           "php",
			"public/index.php":  "<?php",
			"package.json":      `{"scripts":{"build":"vite build"}}`,
			"package-lock.json": "{}",
		})
		got := Detect(dir)
		want := Facts{ComposerLock: true, Laravel: true, PublicIndex: true, AssetInstallCommand: "npm ci", AssetBuildCommand: "npm run build", NpmLock: true}
		if got != want {
			t.Fatalf("facts = %+v, want %+v", got, want)
		}
	})

	t.Run("generic php with npm assets", func(t *testing.T) {
		dir := t.TempDir()
		write(t, dir, map[string]string{
			"composer.json":    `{}`,
			"public/index.php": "<?php",
			"package.json":     `{"scripts":{"build":"vite build"}}`,
		})
		got := Detect(dir)
		if got.Laravel || got.ComposerLock {
			t.Fatalf("facts = %+v", got)
		}
		if !got.PublicIndex || got.AssetInstallCommand != "npm install" || got.AssetBuildCommand != "npm run build" {
			t.Fatalf("assets not detected: %+v", got)
		}
	})

	t.Run("no public document root disables assets", func(t *testing.T) {
		dir := t.TempDir()
		write(t, dir, map[string]string{
			"composer.json": `{}`,
			"package.json":  `{"scripts":{"build":"vite build"}}`,
		})
		if got := Detect(dir); got.AssetInstallCommand != "" {
			t.Fatalf("assets without a public root must be skipped: %+v", got)
		}
	})

	t.Run("pnpm assets are not supported", func(t *testing.T) {
		dir := t.TempDir()
		write(t, dir, map[string]string{
			"composer.json":    `{}`,
			"artisan":          "php",
			"public/index.php": "<?php",
			"package.json":     `{"scripts":{"build":"vite build"}}`,
			"pnpm-lock.yaml":   "x",
		})
		if got := Detect(dir); got.AssetInstallCommand != "" {
			t.Fatalf("pnpm assets must be skipped: %+v", got)
		}
	})

	t.Run("yarn and bun assets are not supported", func(t *testing.T) {
		for lock, content := range map[string]string{
			"yarn.lock": "x",
			"bun.lockb": "\x00",
			"bun.lock":  "{}",
		} {
			t.Run(lock, func(t *testing.T) {
				dir := t.TempDir()
				write(t, dir, map[string]string{
					"composer.json":    `{}`,
					"artisan":          "php",
					"public/index.php": "<?php",
					"package.json":     `{"scripts":{"build":"vite build"}}`,
					lock:               content,
				})
				if got := Detect(dir); got.AssetInstallCommand != "" {
					t.Fatalf("%s assets must be skipped: %+v", lock, got)
				}
			})
		}
	})
}

func laravelFacts() Facts {
	return Facts{ComposerLock: true, Laravel: true, PublicIndex: true, AssetInstallCommand: "npm ci", AssetBuildCommand: "npm run build", NpmLock: true}
}

func TestGoldenDockerfiles(t *testing.T) {
	cases := map[string]struct {
		facts Facts
		build string
		start string
		port  int
	}{
		"generic": {Facts{PublicIndex: true}, "composer install --no-dev", "sh /usr/local/bin/axiom-start", 8080},
		"laravel": {laravelFacts(), "composer install --no-dev --optimize-autoloader", "sh /usr/local/bin/axiom-start", 8080},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			df, err := Dockerfile(c.facts, c.build, c.start, c.port)
			if err != nil {
				t.Fatal(err)
			}
			path := filepath.Join("testdata", "golden", name+".dockerfile")
			if *update {
				if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(path, []byte(df), 0o644); err != nil {
					t.Fatal(err)
				}
				return
			}
			want, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("missing golden file (run go test -update): %v", err)
			}
			if string(want) != df {
				t.Fatalf("dockerfile changed for %s:\n%s", name, df)
			}
		})
	}
}

func TestDockerfileConstructs(t *testing.T) {
	df, err := Dockerfile(laravelFacts(), "composer install --no-dev", "sh /usr/local/bin/axiom-start", 8080)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"FROM " + BaseImage,
		"FROM " + NodeImage + " AS assets",
		"COPY --from=" + ComposerImage + " /usr/bin/composer /usr/bin/composer",
		"COPY composer.lock ./",
		"RUN npm ci",
		"COPY --from=assets /app/public ./public",
		"php artisan migrate --force",
		"php artisan config:cache",
		"php-fpm -F",
		"nginx -g",
		"root /var/www/html/public;",
		"listen 8080;",
		"EXPOSE 8080",
		"php /var/www/html/artisan queue:work",
		"php /var/www/html/artisan schedule:work",
		"[program:queue]",
		"[program:scheduler]",
	} {
		if !strings.Contains(df, want) {
			t.Fatalf("dockerfile must contain %q:\n%s", want, df)
		}
	}
	if strings.Contains(df, "HEALTHCHECK") {
		t.Fatal("health is probed by Axiom, not baked into the image")
	}
}

func TestGenericDockerfileDoesNotStartLaravelWorkers(t *testing.T) {
	df, err := Dockerfile(Facts{PublicIndex: true}, "composer install --no-dev", "sh /usr/local/bin/axiom-start", 8080)
	if err != nil {
		t.Fatal(err)
	}
	for _, unwanted := range []string{
		"[program:queue]",
		"[program:scheduler]",
		"queue:work",
		"schedule:work",
		"FROM " + NodeImage + " AS assets",
		"COPY composer.lock ./",
	} {
		if strings.Contains(df, unwanted) {
			t.Fatalf("generic dockerfile must not contain %q:\n%s", unwanted, df)
		}
	}
	for _, want := range []string{
		"php artisan migrate --force",
		"php artisan config:cache",
		"[program:php-fpm]",
		"[program:nginx]",
	} {
		if !strings.Contains(df, want) {
			t.Fatalf("generic dockerfile must contain %q:\n%s", want, df)
		}
	}
}

func TestDockerfileIsDeterministic(t *testing.T) {
	first, err := Dockerfile(laravelFacts(), "composer install", "sh /usr/local/bin/axiom-start", 8080)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 10; i++ {
		again, err := Dockerfile(laravelFacts(), "composer install", "sh /usr/local/bin/axiom-start", 8080)
		if err != nil || again != first {
			t.Fatalf("Dockerfile is not deterministic: %v", err)
		}
	}
}

func TestDockerfileRejectsInvalidInput(t *testing.T) {
	cases := []struct {
		name  string
		build string
		start string
		port  int
	}{
		{"empty build", "", "sh /usr/local/bin/axiom-start", 8080},
		{"empty start", "composer install", "", 8080},
		{"multiline build", "composer install\nrm -rf /", "sh /usr/local/bin/axiom-start", 8080},
		{"trailing backslash", `composer install \`, "sh /usr/local/bin/axiom-start", 8080},
		{"port out of range", "composer install", "sh /usr/local/bin/axiom-start", 70000},
	}
	for _, c := range cases {
		if _, err := Dockerfile(Facts{}, c.build, c.start, c.port); err == nil {
			t.Errorf("%s: expected an error", c.name)
		}
	}
}
