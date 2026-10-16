import { connectPrisma, prisma } from '../db/prisma';
import { MailerService } from '../services/mailer';

async function main() {
  console.log('[Setup] Connecting to database...');
  await connectPrisma();

  console.log('[Setup] Creating fresh Ethereal SMTP test account...');
  const ethereal = await MailerService.createEtherealAccount();

  console.log('\n================ ETHEREAL SMTP CREDENTIALS ================');
  console.log(`Host:     ${ethereal.host}`);
  console.log(`Port:     ${ethereal.port}`);
  console.log(`User:     ${ethereal.user}`);
  console.log(`Password: ${ethereal.pass}`);
  console.log(`Web Mail: ${ethereal.webUrl}`);
  console.log('===========================================================\n');

  // Upsert sender in database
  const sender = await prisma.sender.upsert({
    where: { email: ethereal.user },
    update: {
      name: `Ethereal (${ethereal.user.split('@')[0]})`,
      host: ethereal.host,
      port: ethereal.port,
      secure: ethereal.secure,
      user: ethereal.user,
      pass: ethereal.pass,
      isDefault: true,
      hourlyLimit: 100,
      active: true,
    },
    create: {
      name: `Ethereal (${ethereal.user.split('@')[0]})`,
      email: ethereal.user,
      host: ethereal.host,
      port: ethereal.port,
      secure: ethereal.secure,
      user: ethereal.user,
      pass: ethereal.pass,
      isDefault: true,
      hourlyLimit: 100,
      active: true,
    },
  });

  // Make sure other senders are not default
  await prisma.sender.updateMany({
    where: { id: { not: sender.id } },
    data: { isDefault: false },
  });

  console.log(`[Setup] Set "${sender.email}" as the primary default sender in PostgreSQL.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[Setup] Error generating Ethereal sender:', err);
  process.exit(1);
});
