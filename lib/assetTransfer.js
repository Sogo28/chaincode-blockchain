'use strict';

const { Contract } = require('fabric-contract-api');

class LandRegistry extends Contract {

    async InitLedger(ctx) {
        console.info('Initialisation du registre foncier...');
        // Aucune initialisation de données n'est nécessaire pour le démarrage
        console.info('Registre foncier initialisé avec succès.');
    }

    /**
     * Crée un nouveau fichier de titre foncier dans le registre
     * @param {Context} ctx - Le contexte de transaction
     * @param {String} hashFichier - Hash SHA-256 du fichier
     * @param {String} cheminFichier - Chemin d'accès au fichier sur le système de fichiers
     * @param {String} metadataJSON - Métadonnées du fichier au format JSON
     * @returns {String} - Les détails du titre créé
     */
    async creerFichier(ctx, hashFichier, cheminFichier, metadataJSON) {
        console.info(`Création d'un nouveau titre foncier avec hash ${hashFichier}`);
        
        // Vérifier si le titre existe déjà
        const exists = await this.titreFoncierExists(ctx, hashFichier);
        if (exists) {
            throw new Error(`Le titre foncier avec le hash ${hashFichier} existe déjà`);
        }

        // Valider et analyser les métadonnées
        let metadata;
        try {
            metadata = JSON.parse(metadataJSON);
        } catch (error) {
            throw new Error(`Format JSON invalide pour les métadonnées: ${error.message}`);
        }

        // Vérifier les champs obligatoires
        if (!metadata.proprietaire) {
            throw new Error('Le champ "proprietaire" est obligatoire dans les métadonnées');
        }

        // Obtenir le timestamp de la transaction depuis le ledger
        const txTimestamp = ctx.stub.getTxTimestamp();
        const txTimestampStr = new Date(txTimestamp.seconds.low * 1000).toISOString();

        // Créer l'objet titre foncier
        const titreFoncier = {
            id: hashFichier,
            cheminFichier: cheminFichier,
            type: 'TITRE_FONCIER',
            metadata: metadata,
            historique: [
                {
                    action: 'CREATION',
                    timestamp: txTimestampStr,
                    details: `Créé par ${metadata.proprietaire}`
                }
            ],
            dateCreation: txTimestampStr,
            derniereMiseAJour: txTimestampStr
        };

        // Enregistrer dans le ledger
        await ctx.stub.putState(hashFichier, Buffer.from(JSON.stringify(titreFoncier)));

        // Émettre un événement de création
        await ctx.stub.setEvent('TitreFoncierCree', Buffer.from(JSON.stringify({
            id: hashFichier,
            proprietaire: metadata.proprietaire,
            timestamp: txTimestampStr
        })));

        return JSON.stringify(titreFoncier);
    }

    /**
     * Récupère un titre foncier par son hash
     * @param {Context} ctx - Le contexte de transaction
     * @param {String} hashFichier - Hash SHA-256 du fichier à récupérer
     * @returns {String} - Les détails du titre foncier au format JSON
     */
    async ReadTitreFoncier(ctx, hashFichier) {
        console.info(`Récupération du titre foncier avec hash ${hashFichier}`);
        
        const titreFoncierJSON = await ctx.stub.getState(hashFichier);
        if (!titreFoncierJSON || titreFoncierJSON.length === 0) {
            throw new Error(`Le titre foncier avec le hash ${hashFichier} n'existe pas`);
        }

        return titreFoncierJSON.toString();
    }

    /**
     * Vérifie si un titre foncier existe
     * @param {Context} ctx - Le contexte de transaction
     * @param {String} hashFichier - Hash SHA-256 du fichier à vérifier
     * @returns {Boolean} - Vrai si le titre existe, faux sinon
     */
    async titreFoncierExists(ctx, hashFichier) {
        const titreFoncierJSON = await ctx.stub.getState(hashFichier);
        return titreFoncierJSON && titreFoncierJSON.length > 0;
    }

    /**
     * Met à jour les métadonnées d'un titre foncier
     * @param {Context} ctx - Le contexte de transaction
     * @param {String} hashFichier - Hash SHA-256 du fichier
     * @param {String} metadataJSON - Nouvelles métadonnées au format JSON
     * @returns {String} - Les détails du titre mis à jour
     */
    async UpdateTitreFoncier(ctx, hashFichier, metadataJSON) {
        console.info(`Mise à jour du titre foncier avec hash ${hashFichier}`);
        
        // Vérifier si le titre existe
        const exists = await this.titreFoncierExists(ctx, hashFichier);
        if (!exists) {
            throw new Error(`Le titre foncier avec le hash ${hashFichier} n'existe pas`);
        }

        // Récupérer le titre existant
        const titreFoncierJSON = await ctx.stub.getState(hashFichier);
        const titreFoncier = JSON.parse(titreFoncierJSON.toString());

        // Valider et analyser les nouvelles métadonnées
        let nouvellesMetadata;
        try {
            nouvellesMetadata = JSON.parse(metadataJSON);
        } catch (error) {
            throw new Error(`Format JSON invalide pour les métadonnées: ${error.message}`);
        }

        // Conserver l'ancien propriétaire pour l'historique
        const ancienProprietaire = titreFoncier.metadata.proprietaire;
        
        // Mettre à jour les métadonnées
        titreFoncier.metadata = {
            ...titreFoncier.metadata,
            ...nouvellesMetadata
        };

        // Obtenir le timestamp de la transaction depuis le ledger
        const txTimestamp = ctx.stub.getTxTimestamp();
        const txTimestampStr = new Date(txTimestamp.seconds.low * 1000).toISOString();

        // Si le propriétaire a changé, ajouter une entrée dans l'historique
        if (nouvellesMetadata.proprietaire && nouvellesMetadata.proprietaire !== ancienProprietaire) {
            titreFoncier.historique.push({
                action: 'TRANSFERT',
                timestamp: txTimestampStr,
                details: `Transféré de ${ancienProprietaire} à ${nouvellesMetadata.proprietaire}`
            });
        } else {
            titreFoncier.historique.push({
                action: 'MISE_A_JOUR',
                timestamp: txTimestampStr,
                details: 'Métadonnées mises à jour'
            });
        }

        // Mettre à jour la date de dernière modification
        titreFoncier.derniereMiseAJour = txTimestampStr;

        // Enregistrer les modifications
        await ctx.stub.putState(hashFichier, Buffer.from(JSON.stringify(titreFoncier)));

        // Émettre un événement de mise à jour
        await ctx.stub.setEvent('TitreFoncierMisAJour', Buffer.from(JSON.stringify({
            id: hashFichier,
            proprietaire: titreFoncier.metadata.proprietaire,
            timestamp: txTimestampStr
        })));

        return JSON.stringify(titreFoncier);
    }

    /**
     * Transfère un titre foncier à un nouveau propriétaire
     * @param {Context} ctx - Le contexte de transaction
     * @param {String} hashFichier - Hash SHA-256 du fichier
     * @param {String} nouveauProprietaire - Identifiant du nouveau propriétaire
     * @param {String} prix - Prix de la transaction (optionnel)
     * @returns {String} - Les détails du titre transféré
     */
    async TransferTitreFoncier(ctx, hashFichier, nouveauProprietaire, prix = "0") {
        console.info(`Transfert du titre foncier ${hashFichier} à ${nouveauProprietaire}`);
        
        // Vérifier si le titre existe
        const exists = await this.titreFoncierExists(ctx, hashFichier);
        if (!exists) {
            throw new Error(`Le titre foncier avec le hash ${hashFichier} n'existe pas`);
        }

        // Récupérer le titre existant
        const titreFoncierJSON = await ctx.stub.getState(hashFichier);
        const titreFoncier = JSON.parse(titreFoncierJSON.toString());

        // Vérifier que le nouveau propriétaire est différent de l'actuel
        const ancienProprietaire = titreFoncier.metadata.proprietaire;
        if (ancienProprietaire === nouveauProprietaire) {
            throw new Error(`Le propriétaire actuel et le nouveau propriétaire sont identiques: ${nouveauProprietaire}`);
        }

        // Vérifier la validité du prix
        const prixNumerique = parseInt(prix);
        if (isNaN(prixNumerique) || prixNumerique < 0) {
            throw new Error(`Prix invalide: ${prix}`);
        }

        // Obtenir le timestamp de la transaction depuis le ledger
        const txTimestamp = ctx.stub.getTxTimestamp();
        const txTimestampStr = new Date(txTimestamp.seconds.low * 1000).toISOString();

        // Mettre à jour le propriétaire
        titreFoncier.metadata.proprietaire = nouveauProprietaire;
        
        // Ajouter une entrée dans l'historique
        titreFoncier.historique.push({
            action: 'TRANSFERT',
            timestamp: txTimestampStr,
            details: `Transféré de ${ancienProprietaire} à ${nouveauProprietaire}`,
            prix: prixNumerique > 0 ? prixNumerique : undefined
        });

        // Mettre à jour la date de dernière modification
        titreFoncier.derniereMiseAJour = txTimestampStr;

        // Enregistrer les modifications
        await ctx.stub.putState(hashFichier, Buffer.from(JSON.stringify(titreFoncier)));

        // Émettre un événement de transfert
        await ctx.stub.setEvent('TitreFoncierTransfere', Buffer.from(JSON.stringify({
            id: hashFichier,
            ancienProprietaire: ancienProprietaire,
            nouveauProprietaire: nouveauProprietaire,
            prix: prixNumerique,
            timestamp: txTimestampStr
        })));

        return JSON.stringify(titreFoncier);
    }

    /**
     * Récupère tous les titres fonciers appartenant à un propriétaire
     * @param {Context} ctx - Le contexte de transaction
     * @param {String} proprietaire - Identifiant du propriétaire
     * @returns {String} - Liste des titres fonciers au format JSON
     */
    async GetTitresFonciersByProprietaire(ctx, proprietaire) {
        console.info(`Récupération des titres fonciers pour le propriétaire ${proprietaire}`);
        
        if (!proprietaire) {
            throw new Error('Le propriétaire est requis');
        }

        const allResults = [];
        // Effectuer une requête par plage sur tout le ledger
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();
        
        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            
            try {
                record = JSON.parse(strValue);
                
                // Vérifier si c'est un titre foncier et si le propriétaire correspond
                if (record.type === 'TITRE_FONCIER' && 
                    record.metadata && 
                    record.metadata.proprietaire === proprietaire) {
                    allResults.push(record);
                }
            } catch (err) {
                console.log(`Erreur lors de l'analyse JSON pour la clé ${result.value.key}: ${err}`);
            }
            
            result = await iterator.next();
        }
        
        return JSON.stringify(allResults);
    }

    /**
     * Récupère tous les titres fonciers
     * @param {Context} ctx - Le contexte de transaction
     * @returns {String} - Liste de tous les titres fonciers au format JSON
     */
    async GetAllTitresFonciers(ctx) {
        console.info('Récupération de tous les titres fonciers');
        
        const allResults = [];
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();
        
        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            
            try {
                record = JSON.parse(strValue);
                
                // Ne conserver que les enregistrements de type TITRE_FONCIER
                if (record.type === 'TITRE_FONCIER') {
                    allResults.push(record);
                }
            } catch (err) {
                console.log(`Erreur lors de l'analyse JSON pour la clé ${result.value.key}: ${err}`);
            }
            
            result = await iterator.next();
        }
        
        return JSON.stringify(allResults);
    }

    /**
     * Supprime un titre foncier du registre
     * @param {Context} ctx - Le contexte de transaction
     * @param {String} hashFichier - Hash SHA-256 du fichier à supprimer
     * @returns {String} - Message de confirmation
     */
    async DeleteTitreFoncier(ctx, hashFichier) {
        console.info(`Suppression du titre foncier avec hash ${hashFichier}`);
        
        // Vérifier si le titre existe
        const exists = await this.titreFoncierExists(ctx, hashFichier);
        if (!exists) {
            throw new Error(`Le titre foncier avec le hash ${hashFichier} n'existe pas`);
        }

        // Récupérer les informations avant suppression pour l'événement
        const titreFoncierJSON = await ctx.stub.getState(hashFichier);
        const titreFoncier = JSON.parse(titreFoncierJSON.toString());

        // Obtenir le timestamp de la transaction depuis le ledger
        const txTimestamp = ctx.stub.getTxTimestamp();
        const txTimestampStr = new Date(txTimestamp.seconds.low * 1000).toISOString();

        // Supprimer du ledger
        await ctx.stub.deleteState(hashFichier);

        // Émettre un événement de suppression
        await ctx.stub.setEvent('TitreFoncierSupprime', Buffer.from(JSON.stringify({
            id: hashFichier,
            proprietaire: titreFoncier.metadata.proprietaire,
            timestamp: txTimestampStr
        })));

        return JSON.stringify({
            message: `Titre foncier ${hashFichier} supprimé avec succès`,
            timestamp: txTimestampStr
        });
    }

    /**
     * Vérifie l'authenticité d'un document en comparant son hash
     * @param {Context} ctx - Le contexte de transaction
     * @param {String} hashFichier - Hash SHA-256 du fichier à vérifier
     * @returns {String} - Résultat de la vérification
     */
    async VerifierAuthenticiteTitreFoncier(ctx, hashFichier) {
        console.info(`Vérification de l'authenticité du titre foncier avec hash ${hashFichier}`);
        
        // Vérifier si le titre existe
        const exists = await this.titreFoncierExists(ctx, hashFichier);
        
        // Obtenir le timestamp de la transaction depuis le ledger
        const txTimestamp = ctx.stub.getTxTimestamp();
        const txTimestampStr = new Date(txTimestamp.seconds.low * 1000).toISOString();
        
        return JSON.stringify({
            hashFichier: hashFichier,
            estAuthentique: exists,
            timestamp: txTimestampStr
        });
    }

    /**
     * Récupère l'historique des transactions pour un titre foncier
     * @param {Context} ctx - Le contexte de transaction
     * @param {String} hashFichier - Hash SHA-256 du fichier
     * @returns {String} - Historique des transactions au format JSON
     */
    async GetHistoriqueTitreFoncier(ctx, hashFichier) {
        console.info(`Récupération de l'historique du titre foncier avec hash ${hashFichier}`);
        
        // Vérifier si le titre existe
        const exists = await this.titreFoncierExists(ctx, hashFichier);
        if (!exists) {
            throw new Error(`Le titre foncier avec le hash ${hashFichier} n'existe pas`);
        }

        const iterator = await ctx.stub.getHistoryForKey(hashFichier);
        const results = [];
        let result = await iterator.next();
        
        while (!result.done) {
            const value = result.value;
            const timestamp = new Date((value.timestamp.seconds.low * 1000));
            
            results.push({
                txId: value.txId,
                timestamp: timestamp.toISOString(),
                isDelete: value.isDelete,
                value: value.isDelete ? null : JSON.parse(Buffer.from(value.value).toString('utf8'))
            });
            
            result = await iterator.next();
        }
        
        return JSON.stringify(results);
    }
}

module.exports = LandRegistry;