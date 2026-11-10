package evidence

import (
	"reflect"
	"strings"
	"testing"
)

const composerLaravel = `{
  "require": {
    "php": "^8.2",
    "laravel/framework": "^11.0",
    "ext-mbstring": "*"
  },
  "scripts": {
    "post-autoload-dump": ["@php artisan package:discover --ansi"]
  }
}`

func phpFacts(t *testing.T, r Result) []string {
	t.Helper()
	f := get(t, r, KindPHP)
	if f.State != StateDetected {
		t.Fatalf("php finding = %+v", f)
	}
	return f.Values
}

func hasFact(values []string, want string) bool {
	for _, v := range values {
		if v == want {
			return true
		}
	}
	return false
}

func TestLaravelDetection(t *testing.T) {
	r := Analyze(snap(map[string]string{
		"composer.json":    composerLaravel,
		"composer.lock":    "{}",
		"artisan":          "#!/usr/bin/env php\n",
		"public/index.php": "<?php\n",
		"package.json":     `{"devDependencies":{"laravel-vite-plugin":"1","vite":"5"},"scripts":{"build":"vite build"}}`,
		"vite.config.js":   "export default {}\n",
	}), Options{})

	assertFinding(t, r, KindLanguage, StateDetected, "PHP")
	assertFinding(t, r, KindPackageManager, StateDetected, "composer")
	assertFinding(t, r, KindFramework, StateDetected, "Laravel")
	assertFinding(t, r, KindRuntimeVersion, StateDetected, "php 8.2")

	facts := phpFacts(t, r)
	for _, want := range []string{"artisan", "document-root:public", "assets:build", "assets:vite", "ext:mbstring", "composer-script:post-autoload-dump"} {
		if !hasFact(facts, want) {
			t.Errorf("missing PHP fact %q in %v", want, facts)
		}
	}
	// 8.2 is not the preset version: the user is warned, never silently rebuilt.
	found := false
	for _, w := range r.Warnings {
		found = found || strings.Contains(w, "PHP 8.2")
	}
	if !found {
		t.Fatalf("warnings = %v", r.Warnings)
	}
}

func TestGenericPHPDetection(t *testing.T) {
	r := Analyze(snap(map[string]string{
		"composer.json":    `{"require":{"php":">=8.3","monolog/monolog":"^3"}}`,
		"public/index.php": "<?php\n",
	}), Options{})

	assertFinding(t, r, KindLanguage, StateDetected, "PHP")
	assertFinding(t, r, KindPackageManager, StateDetected, "composer")
	assertFinding(t, r, KindRuntimeVersion, StateDetected, "php 8.3")
	if f := get(t, r, KindFramework); f.State != StateNotDetected {
		t.Fatalf("framework = %+v", f)
	}
	facts := phpFacts(t, r)
	if !hasFact(facts, "document-root:public") || hasFact(facts, "artisan") {
		t.Fatalf("php facts = %v", facts)
	}
	for _, w := range r.Warnings {
		if strings.Contains(w, "PHP preset") {
			t.Fatalf("8.3 must not warn: %v", r.Warnings)
		}
	}
}

func TestInvalidComposerWarns(t *testing.T) {
	r := Analyze(snap(map[string]string{"composer.json": "{not json"}), Options{})
	assertFinding(t, r, KindLanguage, StateDetected, "PHP")
	found := false
	for _, w := range r.Warnings {
		found = found || strings.Contains(w, "composer.json")
	}
	if !found {
		t.Fatalf("warnings = %v", r.Warnings)
	}
}

func TestNodeAdapters(t *testing.T) {
	r := Analyze(snap(map[string]string{
		"package.json": `{"dependencies":{"astro":"4","@astrojs/node":"9"},"scripts":{"build":"astro build"}}`,
	}), Options{})
	assertFinding(t, r, KindFramework, StateDetected, "Astro")
	if f := get(t, r, KindAdapter); !reflect.DeepEqual(f.Values, []string{"node"}) {
		t.Fatalf("adapters = %+v", f)
	}

	r = Analyze(snap(map[string]string{
		"package.json": `{"dependencies":{"@sveltejs/kit":"2"},"devDependencies":{"@sveltejs/adapter-static":"3"}}`,
	}), Options{})
	assertFinding(t, r, KindFramework, StateDetected, "SvelteKit")
	if f := get(t, r, KindAdapter); !reflect.DeepEqual(f.Values, []string{"static"}) {
		t.Fatalf("adapters = %+v", f)
	}

	// A Go project has no Node adapter: the finding says so instead of being empty.
	r = Analyze(snap(map[string]string{"go.mod": "module m\n\ngo 1.23\n"}), Options{})
	if f := get(t, r, KindAdapter); f.State != StateNotApplicable || f.Reason == "" {
		t.Fatalf("adapters = %+v", f)
	}
}

func TestViteIsAToolInsideFrameworks(t *testing.T) {
	cases := map[string]string{
		"SvelteKit": `{"dependencies":{"@sveltejs/kit":"2"},"devDependencies":{"vite":"5","@sveltejs/adapter-node":"5"}}`,
		"Astro":     `{"dependencies":{"astro":"4","vite":"5"}}`,
		"Nuxt":      `{"dependencies":{"nuxt":"3","vite":"5"}}`,
		"Laravel":   `{"devDependencies":{"vite":"5","laravel-vite-plugin":"1"}}`,
	}
	for want, pkg := range cases {
		t.Run(want, func(t *testing.T) {
			files := map[string]string{"package.json": pkg, "vite.config.js": "export default {}"}
			if want == "Laravel" {
				files["composer.json"] = composerLaravel
			}
			r := Analyze(snap(files), Options{})
			assertFinding(t, r, KindFramework, StateDetected, want)
		})
	}
}

func TestNodeFrameworkParity(t *testing.T) {
	cases := map[string]struct {
		pkg  string
		want string
	}{
		"nuxt":       {`{"dependencies":{"nuxt":"3"}}`, "Nuxt"},
		"remix":      {`{"dependencies":{"remix":"2"}}`, "Remix"},
		"solidstart": {`{"dependencies":{"solid-start":"1"}}`, "SolidStart"},
		"redwoodjs":  {`{"dependencies":{"@redwoodjs/api":"7"}}`, "RedwoodJS"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			r := Analyze(snap(map[string]string{"package.json": c.pkg}), Options{})
			assertFinding(t, r, KindFramework, StateDetected, c.want)
		})
	}
}
