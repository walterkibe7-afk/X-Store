@echo off
REM run-all-tests.bat — orchestrates all local test runners for the X-store project.
REM Usage:  _tests\run-all-tests.bat
REM
REM NOTE: verify_api.py and verify_404_cache_gzip.py require a running dev server
REM       (wrangler dev on port 8787) and are intentionally excluded from this
REM       suite. Run them manually when a local server is available.

setlocal enabledelayedexpansion

set "ROOT=%~dp0.."
pushd "%ROOT%" || exit /b 1

set "FAIL=0"

echo ===== [1/4] Build verification =====
node build.js
if errorlevel 1 (
    echo BUILD: FAILED
    set /a FAIL+=1
) else (
    echo BUILD: PASSED
)

echo.
echo ===== [2/4] Link checker =====
node _tests\link-check.js
if errorlevel 1 (
    echo LINK-CHECK: FAILED
    set /a FAIL+=1
) else (
    echo LINK-CHECK: PASSED
)

echo.
echo ===== [3/4] Auth-flow smoke test =====
node _tests\auth-flow-smoke-test.js
if errorlevel 1 (
    echo SMOKE-TEST: FAILED
    set /a FAIL+=1
) else (
    echo SMOKE-TEST: PASSED
)

echo.
echo ===== [4/4] JSDOM integration test =====
node _tests\jsdom-integration-test.js
if errorlevel 1 (
    echo JSDOM-TEST: FAILED ^(pre-existing, see report^)
    set /a FAIL+=1
) else (
    echo JSDOM-TEST: PASSED
)

echo.
echo ===== Results =====
if %FAIL%==0 (
    echo ALL TESTS PASSED
) else (
    echo %FAIL% TEST GROUP(S) FAILED
)

popd
exit /b %FAIL%
