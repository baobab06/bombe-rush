# Achats intégrés et bombers — état et activation

## Ce qui est fait (version 1.2.0)

| Élément | Fichier |
|---|---|
| Prix en bombers, échanges, **packs en argent réel** (`PACKS`) | `src/meta/economy.ts` |
| Règles : achat en bombers, échange, crédit d'un achat **une seule fois par jeton** | `src/meta/store.ts`, `src/meta/bank.ts` |
| Service de paiement (fournisseurs `none` / `android` / `test`) | `src/platform/billing.ts` |
| Onglet « Bombers » de la boutique, annonce + cadeau de 30 bombers | `src/app/bank.ts` |
| Pont natif **Google Play Billing 8.0** | `android-gradle/.../BillingBridge.java` |

- **Bombers** 💣 : monnaie premium. Tout objet vendu en boutique a un prix en pièces **et** un prix
  en bombers (1 bomber ≈ 10 pièces) ; le joueur choisit. Les bombers s'échangent aussi contre des pièces.
- On en gagne un peu sans payer : cadeau de découverte (30) et 10 le 7e jour de connexion.
- **Coffres : jamais achetables** (ni argent, ni bombers). Ça évite les règles sur les « loot boxes »
  payantes (affichage des probabilités, interdiction en Belgique…).
- **Web** : pas de paiement. Les packs affichent « disponible dans l'appli Android ».
- Test local uniquement : `http://localhost:…/?billing=test` (faux magasin signalé « ACHAT DE TEST »).

## Comment un achat se passe

1. Le joueur touche un pack → l'écran de paiement de Google s'ouvre.
2. Google confirme (état PURCHASED) → le jeu crédite le pack, **sauvegarde**, puis « consomme »
   l'achat (il pourra en racheter).
3. Si l'appli se ferme entre le paiement et le crédit, l'achat est redonné au prochain lancement
   (et au retour dans l'appli) : jamais perdu, jamais crédité deux fois.
4. Paiement en attente (espèces en magasin…) : crédité seulement quand Google le valide.

## À faire dans la Play Console (toi)

1. **Profil de paiement** : Play Console → Paramètres → *Profil de paiement* (compte marchand Google).
   Sans lui, impossible de créer des produits payants.
2. Envoyer la version **1.2.0** (.aab) sur un canal de test (**Tests internes** suffit) : Google
   n'active la facturation qu'une fois une version contenant Billing envoyée.
3. **Monétiser → Produits → Produits intégrés à l'application → Créer**, un par pack, avec
   **exactement** ces identifiants (type : consommable, statut : *Actif*) :

   | Identifiant | Contenu | Prix conseillé |
   |---|---|---|
   | `bombers_80` | 80 bombers | 0,99 € |
   | `bombers_500` | 500 bombers | 4,99 € |
   | `bombers_1200` | 1 200 bombers | 9,99 € |
   | `bombers_2600` | 2 600 bombers | 19,99 € |
   | `coins_2000` | 2 000 pièces | 1,99 € |
   | `coins_6000` | 6 000 pièces | 4,99 € |

   L'appli affiche automatiquement le prix choisi dans la Play Console, dans la devise du joueur.
4. **Testeurs de licence** : Paramètres → *Test des licences* → ajoute ton adresse Gmail.
   Tes achats de test ne sont alors **pas débités** (carte de test « toujours approuvée »).
5. Installe l'appli **depuis le lien de test interne** (pas un APK installé à la main : Google Play
   refuse la facturation pour une appli qui ne vient pas du Play Store).
6. Fiche Play Store : cocher « Contient des achats intégrés » ; *Sécurité des données* : achats → oui.

## Limite connue (à prévoir avant d'en vendre beaucoup)

Comme toute la progression, les bombers sont **stockés sur le téléphone** : quelqu'un de très motivé
peut modifier sa sauvegarde, et un joueur qui change de téléphone repart de zéro. Pour aller plus
loin : comptes joueurs + vérification des achats par le serveur (API Google Play Developer).
