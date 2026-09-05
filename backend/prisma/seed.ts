import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@system.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (existingUser) {
    console.log('Admin user already exists:', adminEmail);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log('Created admin user:', user.email);
  console.log('Role:', user.role);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
