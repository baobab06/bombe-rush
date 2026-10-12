@echo off
chcp 65001 >nul
setlocal
rem ==================================================================
rem  BOMBE RUSH - Creation de TA cle d'importation Google Play
rem  A faire UNE SEULE FOIS. La cle est creee dans :
rem     %USERPROFILE%\BombeRush-cle\bomberush-upload.jks
rem  Garde ce fichier ET son mot de passe en lieu sur (cle USB + gestionnaire
rem  de mots de passe). Ne les envoie a personne, ne les mets jamais sur GitHub.
rem ==================================================================
call "%~dp0trouver-java.bat" || goto :eof
set "DOSSIER=%USERPROFILE%\BombeRush-cle"
set "CLE=%DOSSIER%\bomberush-upload.jks"
if exist "%CLE%" (
  echo.
  echo  Une cle existe deja : %CLE%
  echo  On ne la remplace pas. Utilise directement 2-signer-aab.bat
  pause
  goto :eof
)
if not exist "%DOSSIER%" mkdir "%DOSSIER%"
echo.
echo  Le programme va te demander :
echo   - un mot de passe (au moins 6 caracteres, NOTE-LE)  ^(il ne s'affiche pas quand tu tapes^)
echo   - ton nom, puis des infos facultatives (Entree pour passer), puis "oui" pour confirmer
echo.
"%KEYTOOL%" -genkeypair -v -keystore "%CLE%" -alias upload -keyalg RSA -keysize 2048 -validity 10000
if errorlevel 1 (
  echo  ERREUR : la cle n'a pas ete creee.
  pause
  goto :eof
)
echo.
echo  OK ! Cle creee : %CLE%
echo  ^>^>^> Copie maintenant ce fichier sur une cle USB et note le mot de passe. ^<^<^<
echo  Si tu perds la cle, Google peut la reinitialiser (Play Console ^> Integrite de l'appli),
echo  mais c'est long : mieux vaut la sauvegarder.
pause
