import { View, Div, Anchor, Img, H1, P, Form, Input, Button } from "@matthewp/zebra";
import type { LoginData } from "../loaders/login.ts";

export default class LoginPage extends View {
  private data: LoginData;

  constructor(data: LoginData) {
    super();
    this.data = data;
  }

  render() {
    const form = new Form().setAttribute("method", "POST").addClass("login-container__form").append(
      new Input().setAttribute("type", "password").setAttribute("name", "password")
        .setAttribute("placeholder", "Password").setAttribute("required", "")
        .setAttribute("autofocus", "").addClass("login-container__password"),
      new Button().setAttribute("type", "submit").addClass("login-container__submit").setText("Sign In"),
    );
    if (this.data.error) {
      form.append(new P().addClass("form-error").setText(this.data.error));
    }

    return new Div().addClass("login-container").append(
      new Anchor().setAttribute("href", "/").addClass("login-logo").append(
        new Img().setAttribute("src", "/public/logo.webp").setAttribute("alt", "").addClass("logo__img login-logo__img"),
        "Lyceum",
      ),
      new H1().addClass("login-container__heading").setText("Sign In"),
      new P().addClass("login-container__sub").setText("Enter your password to access your library."),
      form,
    );
  }
}
