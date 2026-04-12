import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  // Point de retour simple pour tester que l'API tourne.
  getHello(): string {
    return 'Hello World!';
  }
}
