const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
Promise.all([p.user.count(), p.studentProfile.count(), p.course.count()])
  .then(([u,s,c]) => console.log('Users:', u, '| Students:', s, '| Courses:', c))
  .finally(() => p.$disconnect())