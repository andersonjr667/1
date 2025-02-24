const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const WhatsAppClient = require('./whatsapp');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://anderson:152070@database.o6gmd.mongodb.net/test?retryWrites=true&w=majority';
const JWT_SECRET = process.env.JWT_SECRET || 'WPYvz*z_ZC5L:?mW.:,MPJ$_U?RD8X';
const VALID_REGISTRATION_CODE = process.env.REGISTRATION_CODE || 'BOAPARTE2024';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MongoDB Connection with retry logic
const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Conectado ao MongoDB - Database: test');
    } catch (err) {
        console.error('Erro ao conectar ao MongoDB:', err);
        // Retry connection after 5 seconds
        setTimeout(connectDB, 5000);
    }
};

connectDB();

// User Schema
const userSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true
    },
    password: { 
        type: String, 
        required: true
    },
    role: {
        type: String,
        default: 'user'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Contact Schema
const contactSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    owner: {
        type: String
    },
    username: {
        type: String
    },
    birthday: {
        type: Date
    },
    receivedMessage: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const User = mongoose.model('User', userSchema, 'users');
const Contact = mongoose.model('Contact', contactSchema, 'contacts');

// Lista de tokens inválidos
let invalidTokens = new Set();

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Token não fornecido' 
            });
        }

        if (invalidTokens.has(token)) {
            return res.status(401).json({
                success: false,
                message: 'Token invalidado'
            });
        }

        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Token inválido ou expirado' 
                });
            }

            req.user = decoded;
            next();
        });
    } catch (error) {
        console.error('Erro na autenticação:', error);
        return res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
};

// Função para verificar se é admin
async function isAdmin(username) {
    try {
        const user = await User.findOne({ username });
        return user && user.role === 'admin';
    } catch (error) {
        console.error('Erro ao verificar admin:', error);
        return false;
    }
}

// Rota de login
app.post("/api/auth/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Usuário e senha são obrigatórios'
            });
        }

        // Buscar usuário no banco
        const user = await User.findOne({ username });
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Usuário não encontrado' 
            });
        }

        // Verificar senha
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ 
                success: false, 
                message: 'Senha incorreta' 
            });
        }

        // Gerar token JWT
        const token = jwt.sign(
            { 
                userId: user._id,
                username: user.username,
                role: user.role 
            }, 
            JWT_SECRET, 
            { expiresIn: '1h' }
        );

        // Enviar resposta
        res.json({ 
            success: true, 
            token,
            username: user.username,
            role: user.role
        });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
});

// Rota para criar usuário de teste (temporária)
app.post("/api/auth/register", async (req, res) => {
    try {
        const { username, password, registrationCode } = req.body;

        // Verificar código de registro
        if (registrationCode !== VALID_REGISTRATION_CODE) {
            return res.status(400).json({
                success: false,
                message: 'Código de registro inválido'
            });
        }

        // Verificar se usuário já existe
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Usuário já existe'
            });
        }

        // Criar hash da senha
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Criar novo usuário
        const user = new User({
            username,
            password: hashedPassword,
            role: username.toLowerCase() === 'admin' ? 'admin' : 'user'
        });

        await user.save();

        res.json({
            success: true,
            message: 'Usuário criado com sucesso'
        });

    } catch (error) {
        console.error('Erro ao criar usuário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
});

// Rota de registro
app.post("/api/register", async (req, res) => {
    try {
        if (!mongoose.connection.readyState) {
            return res.status(500).json({
                success: false,
                message: 'Erro ao conectar com o banco de dados'
            });
        }

        const { username, password, registrationCode } = req.body;

        if (!username || !password || !registrationCode) {
            return res.status(400).json({
                success: false,
                message: 'Todos os campos são obrigatórios'
            });
        }

        if (registrationCode !== VALID_REGISTRATION_CODE) {
            return res.status(401).json({
                success: false,
                message: 'Código de registro inválido'
            });
        }

        const existingUser = await User.findOne({ username });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Username já está em uso'
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = new User({
            username,
            password: hashedPassword
        });

        await user.save();

        res.json({
            success: true,
            message: 'Usuário registrado com sucesso'
        });
    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
});

// Rota para obter contatos
app.get('/api/contacts', authenticateToken, async (req, res) => {
    try {
        let contacts;
        if (req.user.role === 'admin') {
            contacts = await Contact.find().sort({ createdAt: -1 });
        } else {
            contacts = await Contact.find({ username: req.user.username }).sort({ createdAt: -1 });
        }

        res.json({
            success: true,
            contacts: contacts
        });
    } catch (error) {
        console.error('Erro ao listar contatos:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar contatos'
        });
    }
});

// Rota para obter contatos do mês atual
app.get('/api/contacts/month', authenticateToken, async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const contacts = await Contact.find({
            createdAt: {
                $gte: startOfMonth,
                $lte: endOfMonth
            }
        }).sort({ createdAt: -1 });

        res.json(contacts);
    } catch (error) {
        console.error('Erro ao buscar contatos do mês:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar contatos do mês'
        });
    }
});

// Rota para obter contatos por mês específico
app.get('/api/contacts/month/:month', authenticateToken, async (req, res) => {
    try {
        const month = parseInt(req.params.month);
        
        if (isNaN(month) || month < 1 || month > 12) {
            return res.status(400).json({
                success: false,
                message: 'Mês inválido'
            });
        }

        const year = new Date().getFullYear();
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        let query = {
            birthday: {
                $gte: startDate,
                $lte: endDate
            }
        };

        // Se não for admin, filtrar apenas os contatos do usuário
        if (req.user.role !== 'admin') {
            query.username = req.user.username;
        }

        const contacts = await Contact.find(query).sort({ birthday: 1 });

        res.json({
            success: true,
            contacts: contacts
        });
    } catch (error) {
        console.error('Erro ao buscar contatos do mês:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar contatos do mês'
        });
    }
});

// Rota para adicionar contato
app.post("/api/contacts", authenticateToken, async (req, res) => {
    try {
        const { name, phone, birthday } = req.body;
        
        if (!name || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Nome e telefone são obrigatórios'
            });
        }

        const contact = new Contact({
            name,
            phone,
            birthday: birthday || null,
            owner: req.user.username,
            username: req.user.username
        });

        await contact.save();

        res.json({
            success: true,
            message: 'Contato adicionado com sucesso',
            contact
        });
    } catch (error) {
        console.error('Erro ao adicionar contato:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao adicionar contato'
        });
    }
});

// Rota para atualizar contato
app.put("/api/contacts/:id", authenticateToken, async (req, res) => {
    try {
        const { name, phone, birthday } = req.body;
        const contactId = req.params.id;

        if (!name || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Nome e telefone são obrigatórios'
            });
        }

        const contact = await Contact.findById(contactId);

        if (!contact) {
            return res.status(404).json({
                success: false,
                message: 'Contato não encontrado'
            });
        }

        if (contact.owner !== req.user.username && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Não autorizado a editar este contato'
            });
        }

        contact.name = name;
        contact.phone = phone;
        contact.birthday = birthday || contact.birthday;

        await contact.save();

        res.json({
            success: true,
            message: 'Contato atualizado com sucesso',
            contact
        });
    } catch (error) {
        console.error('Erro ao atualizar contato:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar contato'
        });
    }
});

// Rota para deletar contato
app.delete("/api/contacts/:id", authenticateToken, async (req, res) => {
    try {
        const contactId = req.params.id;
        const contact = await Contact.findById(contactId);

        if (!contact) {
            return res.status(404).json({
                success: false,
                message: 'Contato não encontrado'
            });
        }

        if (contact.owner !== req.user.username && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Não autorizado a deletar este contato'
            });
        }

        await Contact.findByIdAndDelete(contactId);

        res.json({
            success: true,
            message: 'Contato deletado com sucesso'
        });
    } catch (error) {
        console.error('Erro ao deletar contato:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao deletar contato'
        });
    }
});

// Rota para listar usuários (apenas admin)
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        // Verifica se o usuário tem role admin no token
        if (!req.user.role || req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado'
            });
        }

        const users = await User.find({}, { password: 0 });
        res.json({
            success: true,
            users
        });
    } catch (error) {
        console.error('Erro ao listar usuários:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar usuários'
        });
    }
});

// Rota para deletar usuário (apenas admin)
app.delete('/api/users/:username', authenticateToken, async (req, res) => {
    try {
        // Verifica se o usuário tem role admin no token
        if (!req.user.role || req.user.role !== 'admin') {
                    return res.status(403).json({
                success: false,
                message: 'Acesso negado'
            });
        }

        const username = req.params.username;
        
        if (username.toLowerCase() === 'anderson') {
            return res.status(400).json({
                success: false,
                message: 'Não é possível deletar o usuário administrador'
            });
        }

        const result = await User.findOneAndDelete({ username: username });
        
        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Usuário deletado com sucesso'
        });
    } catch (error) {
        console.error('Erro ao deletar usuário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao deletar usuário'
        });
    }
});

// Rota de logout
app.post('/logout', authenticateToken, (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        invalidTokens.add(token);
        
        res.json({
            success: true,
            message: 'Logout realizado com sucesso'
        });
    } catch (error) {
        console.error('Erro no logout:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao realizar logout'
        });
    }
});

// Rota temporária para atualizar roles dos usuários
app.get('/update-user-roles', async (req, res) => {
    try {
        // Atualiza todos os usuários para role 'user'
        await User.updateMany({}, { role: 'user' });
        
        // Atualiza o Anderson para role 'admin'
        await User.findOneAndUpdate(
            { username: 'Anderson' },
            { role: 'admin' },
            { new: true }
        );

        res.json({ success: true, message: 'Roles atualizados com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar roles:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao atualizar roles dos usuários' 
        });
    }
});

// Rota para estatísticas do admin
app.get('/api/admin/stats', authenticateToken, async (req, res) => {
    try {
        // Verifica se o usuário é admin
        if (!req.user.role || req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Acesso não autorizado'
            });
        }

        // Total de usuários
        const totalUsers = await User.countDocuments();

        // Total de contatos
        const totalContacts = await Contact.countDocuments();

        // Contatos hoje
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const contactsToday = await Contact.countDocuments({
            createdAt: { $gte: today }
        });

        // Dados para o gráfico (contatos por mês)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        sixMonthsAgo.setDate(1);
        sixMonthsAgo.setHours(0, 0, 0, 0);

        const contactsByMonth = await Contact.aggregate([
            {
                $match: {
                    createdAt: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: {
                    "_id.year": 1,
                    "_id.month": 1
                }
            }
        ]);

        // Preparar dados do gráfico
        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const chartData = {
            labels: [],
            data: []
        };

        // Preencher os últimos 6 meses
        for (let i = 0; i < 6; i++) {
            const date = new Date();
            date.setMonth(date.getMonth() - (5 - i));
            const monthIndex = date.getMonth();
            const year = date.getFullYear();
            
            const monthData = contactsByMonth.find(item => 
                item._id.year === year && item._id.month === (monthIndex + 1)
            );

            chartData.labels.push(months[monthIndex]);
            chartData.data.push(monthData ? monthData.count : 0);
        }

        res.json({
            success: true,
            totalUsers,
            totalContacts,
            contactsToday,
            chartData
        });

    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao carregar estatísticas'
        });
    }
});

// Rota para obter estatísticas do sistema (apenas admin)
app.get('/api/admin/stats', authenticateToken, async (req, res) => {
    try {
        if (!req.user.role || req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado'
            });
        }

        // Obter total de usuários
        const totalUsers = await User.countDocuments();

        // Obter total de contatos
        const totalContacts = await Contact.countDocuments();

        // Obter contatos criados hoje
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const contactsToday = await Contact.countDocuments({
            createdAt: { $gte: today }
        });

        res.json({
            success: true,
            totalUsers,
            totalContacts,
            contactsToday
        });
    } catch (error) {
        console.error('Erro ao obter estatísticas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao obter estatísticas'
        });
    }
});

// Rota para alterar o papel de um usuário (apenas admin)
app.put('/api/users/:username/role', authenticateToken, async (req, res) => {
    try {
        if (!req.user.role || req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado'
            });
        }

        const { username } = req.params;
        const { role } = req.body;

        if (!['admin', 'user'].includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Papel inválido'
            });
        }

        // Não permitir alterar o papel do Anderson
        if (username.toLowerCase() === 'anderson') {
            return res.status(403).json({
                success: false,
                message: 'Não é permitido alterar o papel deste usuário'
            });
        }

        const user = await User.findOneAndUpdate(
            { username },
            { role },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Papel do usuário atualizado com sucesso',
            user: {
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Erro ao alterar papel do usuário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao alterar papel do usuário'
        });
    }
});

// Rota para obter estatísticas de contatos por usuário (apenas admin)
app.get('/api/admin/contacts-by-user', authenticateToken, async (req, res) => {
    try {
        if (!req.user.role || req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado'
            });
        }

        // Agrupa os contatos por usuário e conta quantos cada um tem
        const contactStats = await Contact.aggregate([
            {
                $group: {
                    _id: '$username',
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);

        res.json({
            success: true,
            stats: contactStats
        });
    } catch (error) {
        console.error('Erro ao obter estatísticas de contatos:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao obter estatísticas de contatos'
        });
    }
});

// Rota para obter perfil do usuário
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Erro ao buscar perfil:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar perfil do usuário'
        });
    }
});

// Rota para verificar token
app.get('/api/auth/verify', authenticateToken, (req, res) => {
    try {
        res.json({
            success: true,
            username: req.user.username,
            role: req.user.role
        });
    } catch (error) {
        console.error('Erro na verificação:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao verificar token'
        });
    }
});

let whatsappClient = null;
(async () => {
    try {
        whatsappClient = new WhatsAppClient();
        await whatsappClient.initialize();
        console.log('Cliente WhatsApp inicializado com sucesso!');
    } catch (error) {
        console.error('Erro ao inicializar cliente WhatsApp:', error);
    }
})();

// Rota para enviar mensagem WhatsApp
app.post('/api/send-whatsapp', authenticateToken, async (req, res) => {
    try {
        const { contactId, message } = req.body;

        if (!contactId || !message) {
            return res.status(400).json({
                success: false,
                message: 'ID do contato e mensagem são obrigatórios'
            });
        }

        // Buscar contato
        const contact = await Contact.findById(contactId);
        if (!contact) {
            return res.status(404).json({
                success: false,
                message: 'Contato não encontrado'
            });
        }

        // Enviar mensagem via WhatsApp
        try {
            await whatsappClient.sendMessage(contact.phone, message);
            
            // Atualizar status de mensagem do contato
            contact.receivedMessage = true;
            await contact.save();

            res.json({
                success: true,
                message: 'Mensagem enviada com sucesso'
            });
        } catch (whatsappError) {
            console.error('Erro ao enviar mensagem WhatsApp:', whatsappError);
            res.status(500).json({
                success: false,
                message: 'Erro ao enviar mensagem via WhatsApp'
            });
        }
    } catch (error) {
        console.error('Erro ao processar envio:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
});

// Servir arquivos estáticos depois das rotas da API
app.use(express.static(path.join(__dirname, 'public')));

// Error handling middleware por último
app.use((err, req, res, next) => {
    console.error('Erro no middleware:', err);
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            success: false,
            message: 'Dados inválidos na requisição'
        });
    }
    next();
});

// Serve o arquivo index.html para todas as rotas não encontradas
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
