const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = 'mongodb+srv://anderson:152070@database.o6gmd.mongodb.net/test?retryWrites=true&w=majority';
const JWT_SECRET = 'WPYvz*z_ZC5L:?mW.:,MPJ$_U?RD8X';
const VALID_REGISTRATION_CODE = 'BOAPARTE2024';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Erro no middleware:', err);
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            valid: false,
            message: 'Dados inválidos na requisição.'
        });
    }
    next();
});

// MongoDB Connection
mongoose.connect(MONGODB_URI)
.then(() => console.log(' Conectado ao MongoDB - Database: test'))
.catch(err => console.error(' Erro ao conectar ao MongoDB:', err));

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
        res.status(401).json({ 
            success: false, 
            message: 'Erro na autenticação' 
        });
    }
};

// Função para verificar se é o Anderson (admin)
function isAdmin(username) {
    return username === 'Anderson';
}

// Rota de login
app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Nome de usuário e senha são obrigatórios.'
            });
        }

        // Busca o usuário pelo username
        const user = await User.findOne({ username });
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Nome de usuário ou senha incorretos.'
            });
        }

        // Verifica a senha
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: 'Nome de usuário ou senha incorretos.'
            });
        }

        // Gera o token
        const token = jwt.sign(
            { 
                userId: user._id,
                username: user.username
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Retorna sucesso
        res.json({
            success: true,
            username: user.username,
            token: token,
            message: 'Login realizado com sucesso!'
        });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao processar o login. Por favor, tente novamente.'
        });
    }
});

// Rota de registro
app.post("/register", async (req, res) => {
    try {
        console.log('Recebido request de registro:', req.body);
        const { username, password, registrationCode } = req.body;

        if (!username || !password || !registrationCode) {
            return res.status(400).json({
                valid: false,
                message: 'Todos os campos são obrigatórios.'
            });
        }

        if (registrationCode !== VALID_REGISTRATION_CODE) {
            return res.status(401).json({
                valid: false,
                message: 'Código de registro inválido.'
            });
        }

        if (username.length < 3) {
            return res.status(400).json({
                valid: false,
                message: 'O nome de usuário deve ter pelo menos 3 caracteres.'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                valid: false,
                message: 'A senha deve ter pelo menos 6 caracteres.'
            });
        }

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(409).json({
                valid: false,
                message: 'Este nome de usuário já está em uso.'
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = new User({
            username,
            password: hashedPassword
        });

        await user.save();
        console.log('Usuário registrado com sucesso:', username);

        res.status(201).json({
            valid: true,
            message: 'Usuário registrado com sucesso!'
        });

    } catch (error) {
        console.error('Erro detalhado:', error);
        res.status(500).json({
            valid: false,
            message: 'Erro ao processar o registro. Por favor, tente novamente.'
        });
    }
});

// Rota de validação de token
app.get('/validate-token', authenticateToken, (req, res) => {
    try {
        res.json({
            valid: true,
            message: 'Token válido',
            user: {
                username: req.user.username
            }
        });
    } catch (error) {
        console.error('Erro na validação do token:', error);
        res.status(401).json({
            valid: false,
            message: 'Token inválido ou expirado.'
        });
    }
});

// Rota de logout
app.post('/logout', authenticateToken, (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        invalidTokens.add(token);
        res.json({
            valid: true,
            message: 'Logout realizado com sucesso!'
        });
    } catch (error) {
        console.error('Erro no logout:', error);
        res.status(500).json({
            valid: false,
            message: 'Erro ao processar o logout.'
        });
    }
});

// Rota para obter contatos
app.get('/contacts', authenticateToken, async (req, res) => {
    try {
        let contacts;
        // Não precisamos mais filtrar por usuário, todos veem todos os contatos
        contacts = await Contact.find().sort({ name: 1 });
        
        res.json(contacts);
    } catch (error) {
        console.error('Erro ao buscar contatos:', error);
        res.status(500).json({ message: 'Erro ao buscar contatos' });
    }
});

// Rota para buscar contatos por mês
app.get('/contacts/month/:month', authenticateToken, async (req, res) => {
    try {
        const month = req.params.month;
        
        // Se o mês for 'all', retorna todos os contatos
        if (month === 'all') {
            const contacts = await Contact.find().sort({ name: 1 });
            return res.json(contacts);
        }

        // Converte o mês para número
        const monthNum = parseInt(month);
        if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
            return res.status(400).json({ message: 'Mês inválido' });
        }

        // Cria as datas de início e fim do mês
        const year = new Date().getFullYear();
        const startDate = new Date(year, monthNum - 1, 1);
        const endDate = new Date(year, monthNum, 0);

        // Busca contatos com aniversário no mês especificado
        const contacts = await Contact.find({
            birthday: {
                $gte: startDate,
                $lte: endDate
            }
        }).sort({ name: 1 });

        res.json(contacts);
    } catch (error) {
        console.error('Erro ao buscar contatos por mês:', error);
        res.status(500).json({ message: 'Erro ao buscar contatos por mês' });
    }
});

// Rota para criar contato
app.post("/contacts", async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const { name, phone, birthday } = req.body;
        const username = decoded.username;

        const contact = new Contact({
            name,
            phone,
            birthday,
            owner: username,
            username: username // Mantém ambos para compatibilidade
        });

        await contact.save();
        res.status(201).json({
            success: true,
            contact: {
                id: contact._id,
                name: contact.name,
                phone: contact.phone,
                birthday: contact.birthday,
                owner: contact.owner,
                createdAt: contact.createdAt
            },
            message: 'Contato criado com sucesso'
        });
    } catch (error) {
        console.error('Erro ao criar contato:', error);
        res.status(500).json({ success: false, message: 'Erro ao criar contato' });
    }
});

// Rota para buscar um contato específico
app.get('/contacts/:id', authenticateToken, async (req, res) => {
    try {
        const contact = await Contact.findById(req.params.id);
        
        if (!contact) {
            return res.status(404).json({ message: 'Contato não encontrado' });
        }

        res.json({ 
            contact: {
                id: contact._id,
                name: contact.name,
                phone: contact.phone,
                birthday: contact.birthday,
                owner: contact.owner || contact.username,
                createdAt: contact.createdAt
            }
        });
    } catch (error) {
        console.error('Erro ao buscar contato:', error);
        res.status(500).json({ message: 'Erro ao buscar contato' });
    }
});

// Rota para atualizar contato
app.put('/contacts/:id', authenticateToken, async (req, res) => {
    try {
        const { name, phone, birthday } = req.body;
        const username = req.user.username;
        const contact = await Contact.findById(req.params.id);

        if (!contact) {
            return res.status(404).json({ message: 'Contato não encontrado' });
        }

        // Verifica se o usuário tem permissão para editar
        if (username !== 'Anderson' && contact.owner !== username && contact.username !== username) {
            return res.status(403).json({ message: 'Sem permissão para editar este contato' });
        }

        contact.name = name;
        contact.phone = phone;
        contact.birthday = birthday;
        await contact.save();

        res.json({
            message: 'Contato atualizado com sucesso',
            contact: {
                id: contact._id,
                name: contact.name,
                phone: contact.phone,
                birthday: contact.birthday,
                owner: contact.owner || contact.username,
                createdAt: contact.createdAt
            }
        });
    } catch (error) {
        console.error('Erro ao atualizar contato:', error);
        res.status(500).json({ message: 'Erro ao atualizar contato' });
    }
});

// Rota para deletar contato
app.delete("/contacts/:id", authenticateToken, async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const contact = await Contact.findById(req.params.id);

        if (!contact) {
            return res.status(404).json({ message: 'Contato não encontrado' });
        }

        // Anderson pode deletar qualquer contato
        if (!isAdmin(decoded.username) && contact.owner !== decoded.username && contact.username !== decoded.username) {
            return res.status(403).json({ message: 'Você não tem permissão para excluir este contato' });
        }

        await Contact.findByIdAndDelete(req.params.id);
        res.json({ message: 'Contato excluído com sucesso' });
    } catch (error) {
        console.error('Erro ao excluir contato:', error);
        res.status(500).json({ message: 'Erro ao excluir contato' });
    }
});

// Rota para listar todos os usuários (apenas para Anderson)
app.get('/admin/users', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        if (!isAdmin(decoded.username)) {
            return res.status(403).json({ message: 'Acesso negado' });
        }

        const users = await User.find({}, { password: 0 });
        res.json({ users });
    } catch (error) {
        console.error('Erro ao listar usuários:', error);
        res.status(500).json({ message: 'Erro ao listar usuários' });
    }
});

// Rota para deletar usuário (apenas para Anderson)
app.delete('/admin/users/:username', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        if (!isAdmin(decoded.username)) {
            return res.status(403).json({ message: 'Acesso negado' });
        }

        await User.findOneAndDelete({ username: req.params.username });
        res.json({ message: 'Usuário deletado com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar usuário:', error);
        res.status(500).json({ message: 'Erro ao deletar usuário' });
    }
});

// Rota para deletar qualquer contato (apenas para Anderson)
app.delete('/admin/contacts/:id', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        if (!isAdmin(decoded.username)) {
            return res.status(403).json({ message: 'Acesso negado' });
        }

        await Contact.findByIdAndDelete(req.params.id);
        res.json({ message: 'Contato deletado com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar contato:', error);
        res.status(500).json({ message: 'Erro ao deletar contato' });
    }
});

// Rota para obter estatísticas do sistema (apenas admin)
app.get('/admin/stats', authenticateToken, async (req, res) => {
    try {
        // Verificar se é o Anderson
        if (req.user.username !== 'Anderson') {
            return res.status(403).json({ message: 'Acesso negado' });
        }

        const totalUsers = await User.countDocuments();
        const totalContacts = await Contact.countDocuments();
        
        // Contatos criados hoje
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayContacts = await Contact.countDocuments({
            createdAt: { $gte: today }
        });

        // Usuários ativos (que fizeram login nas últimas 24h)
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const activeUsers = await User.countDocuments({
            lastLogin: { $gte: yesterday }
        });

        res.json({
            totalUsers,
            totalContacts,
            todayContacts,
            activeUsers
        });
    } catch (error) {
        console.error('Erro ao obter estatísticas:', error);
        res.status(500).json({ message: 'Erro ao obter estatísticas' });
    }
});

// Rota para obter logs do sistema (apenas admin)
app.get('/admin/logs', authenticateToken, async (req, res) => {
    try {
        // Verificar se é o Anderson
        if (req.user.username !== 'Anderson') {
            return res.status(403).json({ message: 'Acesso negado' });
        }

        const { type, date } = req.query;
        let query = {};

        if (type && type !== 'all') {
            query.type = type;
        }

        if (date) {
            const startDate = new Date(date);
            const endDate = new Date(date);
            endDate.setDate(endDate.getDate() + 1);
            query.timestamp = { $gte: startDate, $lt: endDate };
        }

        // Simulação de logs (em um sistema real, você teria uma coleção de logs)
        const logs = [
            {
                timestamp: new Date(),
                type: 'system',
                message: 'Sistema iniciado com sucesso'
            },
            {
                timestamp: new Date(),
                type: 'user',
                message: 'Novo usuário registrado'
            },
            {
                timestamp: new Date(),
                type: 'error',
                message: 'Tentativa de acesso não autorizado'
            }
        ];

        // Filtrar logs baseado na query
        const filteredLogs = logs.filter(log => {
            if (type && type !== 'all' && log.type !== type) return false;
            if (date) {
                const logDate = new Date(log.timestamp);
                const queryDate = new Date(date);
                if (logDate.toDateString() !== queryDate.toDateString()) return false;
            }
            return true;
        });

        res.json({ logs: filteredLogs });
    } catch (error) {
        console.error('Erro ao obter logs:', error);
        res.status(500).json({ message: 'Erro ao obter logs' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});