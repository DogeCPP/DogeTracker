#!/bin/sh
# DogeTracker build script
# Supports: mac (Intel + Apple Silicon universal), win, lin

PROJECT_NAME="dogetracker"
VERSION=$(grep "#define VERSION " src/include/config.h | cut -d " " -f 3 | tr -d '"')
echo "Building $PROJECT_NAME.xpl version $VERSION. Is this correct? (y/n):"
read CONFIRM

if [ -z "$CONFIRM" ]; then CONFIRM="y"; fi
if [ "$CONFIRM" != "y" ]; then
    echo "Please update the version number in src/include/config.h and try again."
    exit 1
fi

AVAILABLE_PLATFORMS="mac win lin"
echo "Which platforms would you like to build? ($AVAILABLE_PLATFORMS):"
read PLATFORMS
if [ -z "$PLATFORMS" ]; then PLATFORMS=$AVAILABLE_PLATFORMS; fi

echo "Which X-Plane version? (11/12):"
read XPLANE_VERSION
if [ -z "$XPLANE_VERSION" ]; then XPLANE_VERSION=12; fi

echo "Clean build directory? (y/n):"
read CLEAN_BUILD
if [ -z "$CLEAN_BUILD" ]; then CLEAN_BUILD="n"; fi

if [ "$CLEAN_BUILD" = "y" ]; then
    echo "Cleaning build directories..."
    rm -rf build
fi

echo "Building for: $PLATFORMS  |  X-Plane $XPLANE_VERSION"

for platform in $PLATFORMS; do
    echo "\n--- Building $platform ---"
    if [ $platform = "lin" ]; then
        docker build -t gcc-cmake -f ./docker/Dockerfile.linux . && \
        docker run --user $(id -u):$(id -g) --rm -v $(pwd):/src -w /src gcc-cmake:latest bash -c "\
        cmake -DCMAKE_CXX_FLAGS='-march=x86-64' \
              -DCMAKE_TOOLCHAIN_FILE=toolchain-$platform.cmake \
              -DXPLANE_VERSION=$XPLANE_VERSION \
              -Bbuild/$platform -H. && \
        make -C build/$platform -j\$(nproc)"
    else
        cmake -DCMAKE_TOOLCHAIN_FILE=toolchain-$platform.cmake \
              -DXPLANE_VERSION=$XPLANE_VERSION \
              -Bbuild/$platform -H.
        make -C build/$platform
    fi

    if [ $? -eq 0 ]; then
        echo "\033[1;32m$platform build succeeded.\033[0m"

        # macOS produces a universal binary under mac_x64 (fat binary contains arm64 slice)
        if [ $platform = "mac" ]; then
            OUT_DIR="mac_x64"
        else
            OUT_DIR="${platform}_x64"
        fi

        echo "Product: build/$platform/$OUT_DIR/${PROJECT_NAME}.xpl"
        file build/$platform/$OUT_DIR/${PROJECT_NAME}.xpl
        sleep 1
    else
        echo "\033[1;31m$platform build failed.\033[0m"
        exit 1
    fi
done

echo "\n--- Creating distribution bundle ---"
if [ -d "build/dist" ]; then rm -rf build/dist; fi

for platform in $AVAILABLE_PLATFORMS; do
    if [ $platform = "mac" ]; then
        ARCH_DIR="mac_x64"
    else
        ARCH_DIR="${platform}_x64"
    fi
    mkdir -p build/dist/${ARCH_DIR}
    if [ -d "build/$platform/$ARCH_DIR" ]; then
        cp build/$platform/$ARCH_DIR/${PROJECT_NAME}.xpl \
           build/dist/${ARCH_DIR}/${PROJECT_NAME}.xpl 2>/dev/null || true
    fi
    if echo $PLATFORMS | grep -q $platform && [ -d "lib/${ARCH_DIR}/dist_${XPLANE_VERSION}" ]; then
        cp -r lib/${ARCH_DIR}/dist_${XPLANE_VERSION}/* build/dist/${ARCH_DIR}
    fi
done

cp -r assets build/dist

if [ $XPLANE_VERSION -ge 12 ]; then
    echo "module|https://your-dogetracker-server.com/updates\nname|DogeTracker\nversion|$VERSION\nlocked|false\ndisabled|false\nzone|custom" \
        > build/dist/skunkcrafts_updater.cfg
fi

cd build
mv dist $PROJECT_NAME
DIST_VERSION="$VERSION-XP$XPLANE_VERSION"
rm -f $PROJECT_NAME-$DIST_VERSION.zip
zip -rq $PROJECT_NAME-$DIST_VERSION.zip $PROJECT_NAME -x "*/.DS_Store" -x "*/__MACOSX/*"
mv $PROJECT_NAME dist
cd ..

echo "Bundle created: build/dist/$PROJECT_NAME-$DIST_VERSION.zip"
