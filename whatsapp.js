const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Diretório para armazenar as credenciais
const AUTH_FOLDER = './whatsapp-auth';

// Garante que o diretório de autenticação existe
if (!fs.existsSync(AUTH_FOLDER)) {
    fs.mkdirSync(AUTH_FOLDER, { recursive: true });
}

class WhatsAppClient {
    constructor() {
        this.sock = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    async initialize() {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

            this.sock = makeWASocket({
                printQRInTerminal: true,
                auth: state,
                defaultQueryTimeoutMs: undefined
            });

            // Gerenciar eventos de conexão
            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'close') {
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                    
                    if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        console.log(`Tentando reconectar... Tentativa ${this.reconnectAttempts}`);
                        await this.initialize();
                    }
                } else if (connection === 'open') {
                    console.log('Conexão estabelecida com sucesso!');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                }
            });

            // Salvar credenciais quando atualizadas
            this.sock.ev.on('creds.update', saveCreds);

        } catch (error) {
            console.error('Erro ao inicializar o WhatsApp:', error);
            throw error;
        }
    }

    async sendMessage(phoneNumber, message) {
        try {
            if (!this.isConnected) {
                throw new Error('Cliente WhatsApp não está conectado');
            }

            // Formata o número para o padrão WhatsApp
            const formattedNumber = `${phoneNumber}@s.whatsapp.net`;

            // Envia a mensagem
            const result = await this.sock.sendMessage(formattedNumber, {
                text: message
            });

            console.log(`Mensagem enviada com sucesso para ${phoneNumber}`);
            return result;

        } catch (error) {
            console.error(`Erro ao enviar mensagem para ${phoneNumber}:`, error);
            throw error;
        }
    }
}

// Exporta a classe
module.exports = WhatsAppClient;
