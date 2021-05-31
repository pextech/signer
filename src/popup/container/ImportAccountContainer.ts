import { FieldState } from 'formstate';
import {
  fieldSubmittable,
  valueRequired,
  isAlgorithm
} from '../../lib/FormValidator';
import { action, computed, observable } from 'mobx';
import { encodeBase64 } from 'tweetnacl-util';
import ErrorContainer from './ErrorContainer';
import { Keys } from 'casper-client-sdk';
export interface SubmittableFormData {
  submitDisabled: boolean;
  resetFields: () => void;
}

export class ImportAccountFormData implements SubmittableFormData {
  secretKeyBase64: FieldState<string> = new FieldState<string>('').validators(
    valueRequired
  );
  algorithm: FieldState<string> = new FieldState<string>('').validators(
    valueRequired,
    isAlgorithm
  );
  name: FieldState<string> = new FieldState<string>('').validators(
    valueRequired
  );
  @observable file: File | null = null;

  private checkFileContent(fileContent: string) {
    if (!fileContent) {
      return 'The content of imported file cannot be empty!';
    }
    if (fileContent.includes('PUBLIC KEY')) {
      return 'Not a secret key file!';
    }
    return null;
  }

  constructor(private errors: ErrorContainer) {}

  handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (this.errors.lastError) {
      this.errors.dismissLast();
    }
    if (e.target.files) {
      this.file = e.target.files[0];
      const reader = new FileReader();
      reader.readAsText(this.file);
      reader.onload = e => {
        const fileContents = reader.result as string;
        const errorMsg = this.checkFileContent(fileContents);
        if (errorMsg === null) {
          const file = this.file?.name!.split('.');
          if (file === undefined) {
            this.errors.capture(Promise.reject(new Error('File undefined')));
          } else {
            // File is not undefined now check format by extension
            const fileExt = file[1];
            if (fileExt !== 'pem') {
              this.errors.capture(
                Promise.reject(
                  new Error(
                    `Invalid file format: .${fileExt}. Please upload a .pem file.`
                  )
                )
              );
            } else {
              let pem, parsedKey;
              try {
                switch (this.algorithm.$) {
                  case 'ed25519': {
                    pem = Keys.Ed25519.readBase64WithPEM(fileContents);
                    parsedKey = Keys.Ed25519.parsePrivateKey(pem);
                    break;
                  }
                  case 'secp256k1': {
                    pem = Keys.Secp256K1.readBase64WithPEM(fileContents);
                    parsedKey = Keys.Secp256K1.parsePrivateKey(pem);
                    break;
                  }
                  default: {
                    throw new Error('Invalid algorithm selected');
                  }
                }
                this.secretKeyBase64.onChange(encodeBase64(parsedKey));
              } catch (e) {
                console.log('ERROR', e);
                this.errors.capture(
                  Promise.reject({
                    message:
                      'Key did not match selected algorithm, please close/refresh to try again.'
                  })
                );
              }
            }
          }
        } else {
          this.errors.capture(Promise.reject(new Error(errorMsg)));
        }
      };
    }
  };

  @computed
  get submitDisabled(): boolean {
    return !(
      fieldSubmittable(this.secretKeyBase64) &&
      fieldSubmittable(this.name) &&
      fieldSubmittable(this.algorithm)
    );
  }

  @action
  resetFields() {
    this.secretKeyBase64.reset();
    this.algorithm.reset();
    this.name.reset();
  }
}

export class CreateAccountFormData extends ImportAccountFormData {
  publicKey: FieldState<string> = new FieldState<string>('').validators(
    valueRequired
  );

  constructor(errors: ErrorContainer) {
    super(errors);
    this.algorithm.onUpdate(fieldState => {
      switch (fieldState.value) {
        case 'ed25519': {
          let ed25519KP = Keys.Ed25519.new();
          this.publicKey.onChange(ed25519KP.publicKey.toAccountHex());
          this.secretKeyBase64.onChange(encodeBase64(ed25519KP.privateKey));
          break;
        }
        case 'secp256k1': {
          let secp256k1KP = Keys.Secp256K1.new();
          this.publicKey.onChange(secp256k1KP.publicKey.toAccountHex());
          this.secretKeyBase64.onChange(encodeBase64(secp256k1KP.privateKey));
          break;
        }
        default:
          throw new Error('Invalid algorithm');
      }
    });
  }

  @computed
  get submitDisabled(): boolean {
    return !(
      fieldSubmittable(this.secretKeyBase64) &&
      fieldSubmittable(this.name) &&
      fieldSubmittable(this.publicKey)
    );
  }

  @action
  resetFields() {
    super.resetFields();
    this.publicKey.reset();
  }
}
