@echo off
rem Cherche keytool.exe et jarsigner.exe (Java JDK ou Android Studio).
set "KEYTOOL="
set "JARSIGNER="
for %%P in (keytool.exe) do if not "%%~$PATH:P"=="" set "KEYTOOL=%%~$PATH:P"
for %%P in (jarsigner.exe) do if not "%%~$PATH:P"=="" set "JARSIGNER=%%~$PATH:P"
if defined JARSIGNER if defined KEYTOOL exit /b 0
for /d %%D in ("%ProgramFiles%\Eclipse Adoptium\jdk-*" "%ProgramFiles%\Java\jdk*" "%ProgramFiles%\Microsoft\jdk-*" "%ProgramFiles%\Android\Android Studio\jbr") do (
  if exist "%%~D\bin\jarsigner.exe" (
    set "KEYTOOL=%%~D\bin\keytool.exe"
    set "JARSIGNER=%%~D\bin\jarsigner.exe"
  )
)
if defined JARSIGNER exit /b 0
echo.
echo  Java (JDK) n'est pas installe sur ce PC.
echo  Installe-le en ouvrant "Invite de commandes" puis en tapant :
echo     winget install EclipseAdoptium.Temurin.21.JDK
echo  (ou telecharge "Temurin 21 JDK" sur https://adoptium.net), puis relance ce fichier.
pause
exit /b 1
