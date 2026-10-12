@echo off
chcp 65001 >nul
setlocal
rem ==================================================================
rem  BOMBE RUSH - Signature du .aab avec TA cle d'importation
rem  Mets ce fichier dans le meme dossier que BombeRush-1.0.0-unsigned.aab
rem  Resultat : BombeRush-1.0.0.aab (a televerser sur la Play Console)
rem ==================================================================
call "%~dp0trouver-java.bat" || goto :eof
set "CLE=%USERPROFILE%\BombeRush-cle\bomberush-upload.jks"
if not exist "%CLE%" (
  echo  Pas de cle trouvee dans %CLE%
  echo  Lance d'abord 1-creer-ma-cle.bat
  pause
  goto :eof
)
set "ENTREE="
for %%F in ("%~dp0BombeRush-*-unsigned.aab") do set "ENTREE=%%~fF"
if not defined ENTREE (
  echo  Aucun fichier BombeRush-...-unsigned.aab dans ce dossier.
  pause
  goto :eof
)
set "SORTIE=%ENTREE:-unsigned.aab=.aab%"
echo.
echo  Fichier a signer : %ENTREE%
echo  Tape le mot de passe de ta cle quand il est demande.
echo.
"%JARSIGNER%" -sigalg SHA256withRSA -digestalg SHA-256 -keystore "%CLE%" -signedjar "%SORTIE%" "%ENTREE%" upload
if errorlevel 1 (
  echo  ERREUR : signature impossible ^(mauvais mot de passe ?^)
  pause
  goto :eof
)
"%JARSIGNER%" -verify "%SORTIE%" | findstr /c:"jar verified" >nul
if errorlevel 1 (
  echo  ERREUR : la verification de la signature a echoue.
  pause
  goto :eof
)
echo.
echo  OK ! Fichier pret a envoyer sur Google Play :
echo     %SORTIE%
pause
