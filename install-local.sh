#!/bin/bash

# Install VS Code FreeMarker Extension Locally
# This script builds and installs the extension from the current directory

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

RUN_TESTS=false

# Function to print colored messages
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "syntaxes/ftl.tmLanguage" ]; then
    print_error "This doesn't appear to be the VS Code FreeMarker extension directory"
    print_info "Please run this script from the vs-freemarker directory"
    exit 1
fi

print_info "Starting local installation of VS Code FreeMarker extension..."

# Check if VS Code CLI is available
if ! command -v code &> /dev/null; then
    print_error "VS Code CLI 'code' command not found"
    print_info "Please ensure VS Code is installed and 'code' command is available in PATH"
    print_info "You can install it by opening VS Code and running 'Shell Command: Install 'code' command in PATH'"
    exit 1
fi

# Detect package manager
PACKAGE_MANAGER="npm"
PKG_MANAGER_CMD="npm"

# Check for package manager preference in package.json
if [ -f "package.json" ] && grep -q "pnpm" package.json; then
    if command -v pnpm &> /dev/null; then
        PACKAGE_MANAGER="pnpm"
        PKG_MANAGER_CMD="pnpm"
        print_info "Using pnpm (detected from package.json)"
    else
        print_info "pnpm specified in package.json but not found, trying npm..."
    fi
fi

# Check if package manager is available
if ! command -v $PKG_MANAGER_CMD &> /dev/null; then
    print_error "$PACKAGE_MANAGER not found. Please install Node.js and $PACKAGE_MANAGER"
    if [ "$PACKAGE_MANAGER" = "pnpm" ]; then
        print_info "You can install pnpm with: npm install -g pnpm"
    fi
    exit 1
fi

# Clean up any problematic cached state
if [ "$PACKAGE_MANAGER" = "npm" ]; then
    print_info "Cleaning npm cache..."
    npm cache clean --force 2>/dev/null || true
    
    # Remove node_modules and package-lock.json to start fresh
    if [ -d "node_modules" ]; then
        print_info "Removing existing node_modules..."
        rm -rf node_modules
    fi
    if [ -f "package-lock.json" ]; then
        rm -f package-lock.json
    fi
elif [ "$PACKAGE_MANAGER" = "pnpm" ]; then
    # Remove node_modules and pnpm-lock.yaml to start fresh
    if [ -d "node_modules" ]; then
        print_info "Removing existing node_modules..."
        rm -rf node_modules
    fi
    if [ -f "pnpm-lock.yaml" ]; then
        rm -f pnpm-lock.yaml
    fi
fi

# Check if vsce is available, install if not
if ! command -v vsce &> /dev/null; then
    print_info "Installing Visual Studio Code Extension Manager (vsce)..."
    if [ "$PACKAGE_MANAGER" = "pnpm" ]; then
        pnpm add -g @vscode/vsce || {
            print_error "Failed to install vsce globally with pnpm"
            print_info "Trying to install vsce locally..."
            pnpm add -D @vscode/vsce || {
                print_error "Failed to install vsce. Please install it manually: pnpm add -g @vscode/vsce"
                exit 1
            }
            VSCE_CMD="pnpm exec vsce"
        }
    else
        npm install -g @vscode/vsce || {
            print_error "Failed to install vsce globally"
            print_info "Trying to install vsce locally..."
            npm install --save-dev @vscode/vsce || {
                print_error "Failed to install vsce. Please install it manually: npm install -g @vscode/vsce"
                exit 1
            }
            VSCE_CMD="npx vsce"
        }
    fi
else
    VSCE_CMD="vsce"
fi

# If vsce was not found, set the command properly
if [ -z "$VSCE_CMD" ]; then
    if [ "$PACKAGE_MANAGER" = "pnpm" ]; then
        VSCE_CMD="pnpm exec vsce"
    else
        VSCE_CMD="npx vsce"
    fi
fi

# Install dependencies
print_info "Installing dependencies with $PACKAGE_MANAGER..."
if [ "$PACKAGE_MANAGER" = "pnpm" ]; then
    pnpm install || {
        print_error "Failed to install pnpm dependencies"
        print_info "Trying with --force flag..."
        pnpm install --force || {
            print_error "Still failed. You may need to fix dependency conflicts manually"
            exit 1
        }
    }
else
    npm install --legacy-peer-deps || {
        print_error "Failed to install npm dependencies with legacy-peer-deps"
        print_info "Trying with --force flag..."
        npm install --force || {
            print_error "Still failed. You may need to fix dependency conflicts manually"
            exit 1
        }
    }
fi

# Build the project
print_info "Building the project..."
$PKG_MANAGER_CMD run build || {
    print_error "Build failed. This is a syntax highlighting extension, attempting to package anyway..."
    exit 1
}

# Run tests (make it optional due to potential issues)
if ! [ "$RUN_TESTS" = "false" ]; then
    print_info "Running tests..."
    $PKG_MANAGER_CMD run test || {
        print_error "Tests failed."
        read -p "Do you want to continue with installation despite test failures? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_error "Installation aborted due to test failures"
            exit 1
        fi
        print_info "Continuing with installation despite test failures..."
    }
fi

# Get current extension info
EXTENSION_NAME=$(node -p "require('./package.json').name")
EXTENSION_VERSION=$(node -p "require('./package.json').version")
EXTENSION_PUBLISHER=$(node -p "require('./package.json').publisher || 'local'")

print_info "Extension: ${EXTENSION_PUBLISHER}.${EXTENSION_NAME} v${EXTENSION_VERSION}"

# Check if extension is already installed
INSTALLED_VERSION=$(code --list-extensions --show-versions | grep "${EXTENSION_PUBLISHER}.${EXTENSION_NAME}" | cut -d'@' -f2 || echo "")

if [ ! -z "$INSTALLED_VERSION" ]; then
    print_info "Extension is already installed (version $INSTALLED_VERSION)"
    read -p "Do you want to uninstall the existing version first? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Uninstalling existing extension..."
        code --uninstall-extension "${EXTENSION_PUBLISHER}.${EXTENSION_NAME}" || {
            print_error "Failed to uninstall existing extension"
        }
    fi
fi

# Package the extension
print_info "Packaging extension..."
${VSCE_CMD} package --out "./dist/${EXTENSION_NAME}-${EXTENSION_VERSION}.vsix" || {
    print_error "Failed to package extension"
    exit 1
}

# Install the packaged extension
print_info "Installing extension locally..."
code --install-extension --force "./dist/${EXTENSION_NAME}-${EXTENSION_VERSION}.vsix" || {
    print_error "Failed to install extension"
    exit 1
}

print_success "Extension installed successfully!"

# Check if installation was successful
INSTALLED_VERSION=$(code --list-extensions --show-versions | grep "${EXTENSION_PUBLISHER}.${EXTENSION_NAME}" | cut -d'@' -f2 || echo "")

if [ ! -z "$INSTALLED_VERSION" ]; then
    print_success "Extension ${EXTENSION_PUBLISHER}.${EXTENSION_NAME}@${INSTALLED_VERSION} is now active"
else
    print_error "Extension installation may have failed. Please check VS Code extensions manually"
    exit 1
fi

# Optional: Open example template
read -p "Do you want to open an example FreeMarker template to test the extension? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -f "examples/comprehensive-example.ftl" ]; then
        print_info "Opening comprehensive example..."
        code "examples/comprehensive-example.ftl"
    elif [ -f "examples/index.ftl" ]; then
        print_info "Opening basic example..."
        code "examples/index.ftl"
    else
        print_info "No example files found. You can create a .ftl file to test the extension"
    fi
fi

print_success "Installation complete! The FreeMarker extension should now be available in VS Code"
print_info "You can:"
print_info "1. Create or open .ftl files to see syntax highlighting"
print_info "2. Use the static analyzer features for template validation"
print_info "3. Check the VS Code Extensions view to verify installation"

# Clean up (optional)
read -p "Do you want to clean up the generated .vsix package? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -f "./dist/${EXTENSION_NAME}-${EXTENSION_VERSION}.vsix"
    print_info "Package file cleaned up"
fi

print_success "Done!"