package evidence

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/digitaleflex/axiom/services/engine/internal/runtime/presets"
)

// PHP application detection. The analyzer reads composer.json and a few known
// files only; it never runs Composer, Artisan or any repository script.
//
// PHP-specific conclusions that are not a language, framework or package
// manager are recorded as tokens in the multi-valued "php" finding:
//
//	artisan                 the Laravel console entrypoint exists
//	document-root:public    public/index.php is the HTTP document root
//	assets:build            package.json declares a build script (npm assets)
//	assets:vite             laravel-vite-plugin is a dependency
//	ext:<name>              composer.json requires the PHP extension
//	composer-script:<name>  composer.json declares the script

const (
	phpFactArtisan        = "artisan"
	phpFactDocumentRoot   = "document-root:public"
	phpFactAssetsBuild    = "assets:build"
	phpFactAssetsVite     = "assets:vite"
	phpFactExtension      = "ext:"
	phpFactComposerScript = "composer-script:"
)

type composerJSON struct {
	Require    map[string]string          `json:"require"`
	RequireDev map[string]string          `json:"require-dev"`
	Scripts    map[string]json.RawMessage `json:"scripts"`
}

func (c composerJSON) has(pkg string) bool {
	_, a := c.Require[pkg]
	_, b := c.RequireDev[pkg]
	return a || b
}

// phpVersionRe extracts the first major.minor pair of a Composer constraint:
// "^8.3", ">=8.2 <8.4", "8.1.*" and "~8.3.0" all yield 8.3/8.2/8.1.
var phpVersionRe = regexp.MustCompile(`(\d+)\.(\d+)`)

func (a *analysis) detectPHP() {
	f, ok := a.file("composer.json")
	if !ok {
		// An artisan file without composer.json is still a PHP application, but
		// the preset refuses it later for lack of a dependency manifest.
		if a.exists("artisan") {
			a.vote(KindLanguage, "PHP", 0.95, Evidence{Source: SourceManifest, Path: a.abs("artisan"), Rule: "php.artisan", Explanation: "artisan is a PHP console entrypoint"})
			a.addMulti(KindPHP, phpFactArtisan, Evidence{Source: SourceManifest, Path: a.abs("artisan"), Rule: "php.artisan", Explanation: "artisan is a PHP console entrypoint"})
		}
		return
	}
	p := a.abs("composer.json")
	a.vote(KindLanguage, "PHP", 1, Evidence{Source: SourceManifest, Path: p, Rule: "php.language.composer", Explanation: "composer.json defines a PHP project"})
	a.vote(KindPackageManager, "composer", 1, Evidence{Source: SourceManifest, Path: p, Rule: "php.pm.composer", Explanation: "Composer manages the PHP dependencies"})

	var c composerJSON
	parsed := false
	if f.Retained {
		if err := json.Unmarshal(bytes.TrimSpace(f.Content), &c); err != nil {
			a.warnings = append(a.warnings, "composer.json is not valid JSON")
		} else {
			parsed = true
		}
	}

	// Declared interpreter version: informational, the preset builds with
	// presets.PHPVersion. Composer constraints are not resolved, only read.
	if v := c.Require["php"]; v != "" {
		if m := phpVersionRe.FindStringSubmatch(v); m != nil {
			minor := m[1] + "." + m[2]
			a.vote(KindRuntimeVersion, "php "+minor, 1, Evidence{Source: SourceManifest, Path: p, Lines: lineOf(f.Content, `"php"`), Rule: "php.version.composer",
				Explanation: "composer.json requires PHP " + v})
			if minor != presets.PHPVersion {
				a.warnings = append(a.warnings, fmt.Sprintf("composer.json requires PHP %s; the Axiom PHP preset builds with PHP %s", minor, presets.PHPVersion))
			}
		}
	}

	if parsed {
		if c.has("laravel/framework") {
			a.vote(KindFramework, "Laravel", 0.95, Evidence{Source: SourceManifest, Path: p, Lines: lineOf(f.Content, "laravel/framework"), Rule: "php.framework.laravel",
				Explanation: "laravel/framework is a dependency"})
		}
		for pkg := range c.Require {
			if ext, ok := strings.CutPrefix(pkg, "ext-"); ok && ext != "" {
				a.addMulti(KindPHP, phpFactExtension+ext, Evidence{Source: SourceManifest, Path: p, Lines: lineOf(f.Content, `"`+pkg+`"`), Rule: "php.extension.require",
					Explanation: "composer.json requires the PHP extension " + ext})
			}
		}
		for name := range c.Scripts {
			a.addMulti(KindPHP, phpFactComposerScript+name, Evidence{Source: SourceManifest, Path: p, Lines: lineOf(f.Content, `"`+name+`"`), Rule: "php.composer_script",
				Explanation: "composer.json declares the script " + name})
		}
	}

	if a.exists("artisan") {
		a.addMulti(KindPHP, phpFactArtisan, Evidence{Source: SourceManifest, Path: a.abs("artisan"), Rule: "php.artisan", Explanation: "artisan is a PHP console entrypoint"})
	}
	if a.exists("public/index.php") {
		a.addMulti(KindPHP, phpFactDocumentRoot, Evidence{Source: SourceManifest, Path: a.abs("public/index.php"), Rule: "php.document_root.public",
			Explanation: "public/index.php is the HTTP document root"})
	}

	// Frontend assets are built with npm; the runtime preset only supports npm.
	if pf, ok := a.file("package.json"); ok && pf.Retained {
		var pkg packageJSON
		if err := json.Unmarshal(pf.Content, &pkg); err == nil {
			if cmd := strings.TrimSpace(pkg.Scripts["build"]); cmd != "" {
				a.addMulti(KindPHP, phpFactAssetsBuild, Evidence{Source: SourceScript, Path: a.abs("package.json"), Lines: lineOf(pf.Content, `"build"`), Rule: "php.assets.build_script",
					Explanation: "package.json declares a build script for the frontend assets"})
			}
			if pkg.has("laravel-vite-plugin") {
				a.addMulti(KindPHP, phpFactAssetsVite, Evidence{Source: SourceManifest, Path: a.abs("package.json"), Lines: lineOf(pf.Content, `"laravel-vite-plugin"`), Rule: "php.assets.vite",
					Explanation: "laravel-vite-plugin builds the Laravel assets with Vite"})
			}
		}
	}
}
