import { View, Div, Anchor, Img, H1, P, Form, Input, Button } from "@matthewp/zebra";
import type { LoginData } from "../loaders/login.ts";

export default class LoginPage extends View {
  private data: LoginData;

  constructor(data: LoginData) {
    super();
    this.data = data;
  }

  render() {
    const form = new Form().setAttribute("method", "POST").addClass("login-form").append(
      new Input().setAttribute("type", "password").setAttribute("name", "password")
        .setAttribute("placeholder", "Password").setAttribute("required", "")
        .setAttribute("autofocus", ""),
      new Button().setAttribute("type", "submit").setText("Sign In"),
    );
    if (this.data.error) {
      form.append(new P().addClass("error").setText(this.data.error));
    }

    return new Div().addClass("login-container").append(
      new Anchor().setAttribute("href", "/").addClass("login-logo").append(
        new Img().setAttribute("src", "/public/logo.webp").setAttribute("alt", "").addClass("logo-img"),
        "Lyceum",
      ),
      new H1().addClass("login-heading").setText("Sign In"),
      new P().addClass("login-sub").setText("Enter your password to access your library."),
      form,
    );
  }
}
