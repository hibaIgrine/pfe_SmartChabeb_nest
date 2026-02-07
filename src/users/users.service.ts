import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
@Injectable()
export class UsersService {
  //inject service prisma
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: any) {
    try {
      const salt = await bcrypt.genSalt();
      const hashedPassword = await bcrypt.hash(
        createUserDto.mot_de_passe,
        salt,
      );
      const vCode = Math.floor(1000 + Math.random() * 9000).toString();

      const user = await this.prisma.utilisateurs.create({
        data: {
          nom: createUserDto.nom,
          prenom: createUserDto.prenom,
          email: createUserDto.email,
          mot_de_passe: hashedPassword,
          role: 'ADHERENT',
          code_verification: vCode,
          est_verifie: false,
        },
      });

      console.log(`✅ SUCCÈS : Code pour ${user.email} est : ${vCode}`);
      return user;
    } catch (error) {
      // Si l'erreur est un doublon d'email (Code P2002 de Prisma)
      if (error.code === 'P2002') {
        throw new ConflictException(
          'Cet email est déjà utilisé par un autre compte.',
        );
      }
      throw error;
    }
  }

  async verifyEmail(email: string, code: string) {
    // 1. Chercher l'utilisateur par son email
    const user = await this.prisma.utilisateurs.findUnique({
      where: { email: email },
    });

    // 2. Vérifier si l'utilisateur existe et si le code est le bon
    if (!user || user.code_verification !== code) {
      throw new UnauthorizedException('Le code de vérification est incorrect.');
    }

    // 3. Si c'est bon, on valide l'utilisateur et on efface le code
    return await this.prisma.utilisateurs.update({
      where: { email: email },
      data: {
        est_verifie: true,
        code_verification: null, // Le code ne sert plus à rien
      },
    });
  }

  async updateProfile(email: string, updateProfileDto: any) {
    return await this.prisma.utilisateurs.update({
      where: { email: email },
      data: {
        genre: updateProfileDto.genre,
        date_naissance: new Date(updateProfileDto.date_naissance),
      },
    });
  }
  async saveBiometrics(dto: any) {
    // 1. On cherche l'utilisateur par son email pour avoir son ID
    const user = await this.prisma.utilisateurs.findUnique({
      where: { email: dto.email },
    });

    if (!user) throw new Error('Utilisateur non trouvé');

    // 2. Calcul de l'IMC : Poids / (Taille en mètre * Taille en mètre)
    const tailleEnMetres = dto.taille / 100;
    const imcCalculé = dto.poids / (tailleEnMetres * tailleEnMetres);

    // 3. Enregistrement dans la table suivi_biometrique
    return await this.prisma.suivi_biometrique.create({
      data: {
        id_utilisateur: user.id,
        poids_kg: dto.poids,
        taille_cm: dto.taille,
        imc: parseFloat(imcCalculé.toFixed(2)), // On arrondit à 2 chiffres
        date_mesure: new Date(),
      },
    });
  }
  async findAll() {
    return await this.prisma.utilisateurs.findMany();
  }

  async findOne(id: string) {
    return await this.prisma.utilisateurs.findUnique({
      where: { id: id },
    });
  }

  update(id: string, updateUserDto: UpdateUserDto) {
    return `This action updates a #${id} user`;
  }

  remove(id: string) {
    return `This action removes a #${id} user`;
  }
}
